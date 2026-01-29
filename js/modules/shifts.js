// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.1.0
// Purpose: Shift lifecycle (start/pause/end) + 3 timers + DB pause log
// Timers:
//  - TOTAL (on-duty): from start to now, ignores pauses
//  - ACTIVE (work): total minus pauses
//  - REMAIN (target): target - active
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// pause cache (module scoped; avoids touching Proxy state with unknown keys)
let pauseRows = []; // [{id,start_time,end_time}]
let openPauseId = null;
let pauseLoadedForShiftId = null;

// ────────────────────────────────────────────────────────────────
// START SHIFT
// ────────────────────────────────────────────────────────────────

export function openStartModal() {
  vibrate();
  const select = document.getElementById('start-vehicle');

  if (!select) {
    showToast('UI error: missing vehicle selector', 'error');
    return;
  }

  select.innerHTML = (state.fleet || [])
    .map(v => `<option value="${v.id}">${v.name}</option>`)
    .join('');

  openModal('start-modal');
}

export async function confirmStart() {
  vibrate([20]);

  const vehicleId = document.getElementById('start-vehicle')?.value;
  const startOdoRaw = document.getElementById('start-odo')?.value;
  const targetRaw = document.getElementById('start-goal')?.value; // hours

  if (!vehicleId) return showToast('Pasirinkite automobilį', 'warning');

  const startOdo = parseInt(startOdoRaw || '0', 10) || 0;
  const targetHours = parseFloat(targetRaw || '0') || 0;

  state.loading = true;
  try {
    const payload = {
      user_id: state.user.id,
      vehicle_id: vehicleId,
      start_odo: startOdo,
      start_time: new Date().toISOString(),
      target_hours: targetHours || null, // keep your existing column
      status: 'active'
    };

    // Optional compatibility: if you added target_minutes column, set it too
    // (won't error if column doesn't exist? Supabase WILL error if unknown)
    // So we do NOT include it here unless you confirm it's in your schema.

    const { data, error } = await db
      .from('finance_shifts')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    state.activeShift = data;

    // reset pause cache
    pauseRows = [];
    openPauseId = null;
    pauseLoadedForShiftId = String(data.id);

    showToast('START SHIFT', 'success');
    closeModals();
    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    showToast(e?.message || 'Start error', 'error');
  } finally {
    state.loading = false;
  }
}

// ────────────────────────────────────────────────────────────────
// END SHIFT
// ────────────────────────────────────────────────────────────────

export function openEndModal() {
  vibrate();
  if (!state.activeShift) return;

  const endOdoEl = document.getElementById('end-odo');
  if (endOdoEl && !endOdoEl.value) {
    endOdoEl.value = String(state.activeShift.start_odo || '');
  }

  openModal('end-modal');
}

export async function confirmEnd() {
  vibrate([20]);

  if (!state.activeShift?.id) {
    showToast('Nėra aktyvios pamainos', 'warning');
    return;
  }

  const endOdoEl = document.getElementById('end-odo');
  const earnEl = document.getElementById('end-earn');

  const endOdoRaw = endOdoEl?.value;
  const earnRaw = earnEl?.value;

  if (endOdoRaw === '' || endOdoRaw == null) return showToast('Įveskite ridą', 'warning');
  if (earnRaw === '' || earnRaw == null) return showToast('Įveskite uždarbį', 'warning');

  const endOdo = parseInt(endOdoRaw || '0', 10) || 0;
  const earn = parseFloat(earnRaw || '0') || 0;

  const weather = document.getElementById('end-weather')?.value || 'sunny';

  state.loading = true;
  try {
    // If currently paused: close open pause first (so analytics is correct)
    await ensurePauseClosedIfNeeded(state.activeShift.id);

    stopTimer();

    const { error: updErr } = await db
      .from('finance_shifts')
      .update({
        end_time: new Date().toISOString(),
        end_odo: endOdo || (state.activeShift.start_odo || 0),
        gross_earnings: earn,
        status: 'completed',
        weather
      })
      .eq('id', state.activeShift.id);

    if (updErr) throw updErr;

    showToast('END SHIFT', 'success');

    // clear state + caches
    state.activeShift = null;
    pauseRows = [];
    openPauseId = null;
    pauseLoadedForShiftId = null;

    closeModals();
    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    showToast(e?.message || 'End error', 'error');
  } finally {
    state.loading = false;
  }
}

// ────────────────────────────────────────────────────────────────
// PAUSE / RESUME (DB logged)
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
  vibrate();
  const s = state.activeShift;
  if (!s?.id) return;

  // Ensure pause list is loaded for correct resume handling after refresh
  await syncPausesFromDB(s.id);

  const isActive = s.status === 'active';
  const newStatus = isActive ? 'paused' : 'active';

  // Optimistic UI
  s.status = newStatus;
  syncPauseButtonUI(newStatus);

  try {
    if (newStatus === 'paused') {
      // create a new pause row
      const { data, error } = await db
        .from('finance_shift_pauses')
        .insert({
          user_id: state.user.id,
          shift_id: s.id,
          start_time: new Date().toISOString(),
          end_time: null
        })
        .select()
        .single();

      if (error) throw error;

      openPauseId = data?.id || null;
      // update local cache
      pauseRows.push({ id: data.id, start_time: data.start_time, end_time: data.end_time });
      stopTimer(); // active timer should freeze
      updateTimerDisplay(); // refresh UI immediately
    } else {
      // resume: close the latest open pause
      const pid = openPauseId || findOpenPauseId();
      if (pid) {
        const { error } = await db
          .from('finance_shift_pauses')
          .update({ end_time: new Date().toISOString() })
          .eq('id', pid);

        if (error) throw error;

        // update local cache
        pauseRows = pauseRows.map(p => (String(p.id) === String(pid) ? { ...p, end_time: new Date().toISOString() } : p));
        openPauseId = null;
      }

      startTimer();
    }

    // persist shift status
    const { error: stErr } = await db
      .from('finance_shifts')
      .update({ status: newStatus })
      .eq('id', s.id);

    if (stErr) throw stErr;
  } catch (e) {
    console.error(e);
    // revert via refresh (single source of truth)
    window.dispatchEvent(new Event('refresh-data'));
  }
}

function syncPauseButtonUI(status) {
  const btn = document.getElementById('btn-pause');
  if (!btn) return;

  if (status === 'active') {
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    btn.classList.remove('bg-yellow-500/20', 'text-yellow-500');
  } else {
    btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    btn.classList.add('bg-yellow-500/20', 'text-yellow-500');
  }
}

// ────────────────────────────────────────────────────────────────
// TIMER (3 displays, theme-safe)
// ────────────────────────────────────────────────────────────────

export function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  // load pauses once per active shift to make ACTIVE time correct after refresh
  const s = state.activeShift;
  if (s?.id) {
    syncPausesFromDB(s.id)
      .catch(() => {})
      .finally(() => {
        updateTimerDisplay();
        timerInterval = setInterval(updateTimerDisplay, 1000);
      });
  } else {
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }
}

export function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;

  const timerEl = document.getElementById('shift-timer');
  if (timerEl) {
    timerEl.classList.add('opacity-50');
    timerEl.classList.remove('pulse-text');
  }
}

async function syncPausesFromDB(shiftId) {
  const sid = String(shiftId);
  if (!sid) return;

  if (pauseLoadedForShiftId === sid) return;

  const { data, error } = await db
    .from('finance_shift_pauses')
    .select('id, start_time, end_time')
    .eq('shift_id', shiftId)
    .eq('user_id', state.user.id)
    .order('start_time', { ascending: true });

  if (error) throw error;

  pauseRows = (data || []).map(p => ({
    id: p.id,
    start_time: p.start_time,
    end_time: p.end_time
  }));

  // detect open pause
  const open = pauseRows.find(p => !p.end_time);
  openPauseId = open?.id || null;

  pauseLoadedForShiftId = sid;
}

function findOpenPauseId() {
  const open = pauseRows.find(p => !p.end_time);
  return open?.id || null;
}

async function ensurePauseClosedIfNeeded(shiftId) {
  // refresh local cache first
  try {
    await syncPausesFromDB(shiftId);
  } catch (_) {}

  const pid = openPauseId || findOpenPauseId();
  if (!pid) return;

  // close it
  await db
    .from('finance_shift_pauses')
    .update({ end_time: new Date().toISOString() })
    .eq('id', pid);

  // local cache update
  pauseRows = pauseRows.map(p => (String(p.id) === String(pid) ? { ...p, end_time: new Date().toISOString() } : p));
  openPauseId = null;
}

function updateTimerDisplay() {
  const s = state.activeShift;
  if (!s?.start_time) return;

  const nowMs = Date.now();
  const startMs = new Date(s.start_time).getTime();

  const endMs = s.end_time ? new Date(s.end_time).getTime() : nowMs;
  const totalMs = Math.max(0, endMs - startMs);

  // pause sum
  const pauseMs = sumPauseMs(endMs);

  const activeMs = Math.max(0, totalMs - pauseMs);

  // target (hours from your existing column)
  const targetHours = parseFloat(s.target_hours || 0) || 0;
  const targetMs = targetHours > 0 ? targetHours * 60 * 60 * 1000 : 0;
  const remainMs = targetMs > 0 ? Math.max(0, targetMs - activeMs) : 0;

  // Render into optional elements
  const elTotal = document.getElementById('shift-timer-total');
  const elActive = document.getElementById('shift-timer-active');
  const elRemain = document.getElementById('shift-timer-remaining');

  if (elTotal) elTotal.textContent = fmtHMS(totalMs);
  if (elActive) elActive.textContent = fmtHMS(activeMs);
  if (elRemain) elRemain.textContent = targetMs > 0 ? fmtHMS(remainMs) : '--:--:--';

  // Backward compatible: existing single timer shows ACTIVE (most useful)
  const el = document.getElementById('shift-timer');
  if (el) {
    el.textContent = fmtHMS(activeMs);

    // if paused, freeze look
    if (s.status === 'paused') {
      el.classList.add('opacity-50');
      el.classList.remove('pulse-text');
    } else {
      el.classList.remove('opacity-50');
      el.classList.add('pulse-text');
    }
  }
}

function sumPauseMs(endOrNowMs) {
  if (!pauseRows?.length) return 0;

  let sum = 0;
  for (const p of pauseRows) {
    const ps = new Date(p.start_time).getTime();
    const pe = p.end_time ? new Date(p.end_time).getTime() : endOrNowMs;
    if (Number.isFinite(ps) && Number.isFinite(pe) && pe > ps) {
      sum += (pe - ps);
    }
  }
  return sum;
}

function fmtHMS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

// ────────────────────────────────────────────────────────────────
// WEATHER (End modal)
// ────────────────────────────────────────────────────────────────

export function selectWeather(type) {
  vibrate();

  document.querySelectorAll('.weather-btn').forEach(b => {
    b.classList.remove('border-teal-500', 'bg-teal-500/20');
  });

  const hidden = document.getElementById('end-weather');
  if (hidden) hidden.value = type;
}
