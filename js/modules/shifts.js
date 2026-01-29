// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.1.1 (PAUSE FIX + 3 TIMERS SAFE)
// Fixes:
//  - Makes pause callable from HTML onclick (pauseShift/togglePauseShift)
//  - Supports multiple button ids (btn-pause, pause-btn, btnPause, etc.)
//  - If DB pause table missing -> UI pause still works + toast warning
// Timers:
//  - TOTAL (on-duty): start->now (ignores pauses)
//  - ACTIVE: total - pauses
//  - REMAIN: target - active
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// pause cache
let pauseRows = []; // [{id,start_time,end_time}]
let openPauseId = null;
let pauseLoadedForShiftId = null;

function getPauseBtn() {
  return (
    document.getElementById('btn-pause') ||
    document.getElementById('pause-btn') ||
    document.getElementById('btnPause') ||
    document.getElementById('pauseShiftBtn') ||
    document.querySelector('[data-action="pause"]') ||
    null
  );
}

function isPausedStatus(status) {
  // be tolerant: some old builds might use 'pause', 'paused', etc.
  return String(status || '').toLowerCase().includes('paus');
}

function normalizeStatus(status) {
  return isPausedStatus(status) ? 'paused' : 'active';
}

// ────────────────────────────────────────────────────────────────
// START SHIFT
// ────────────────────────────────────────────────────────────────

export function openStartModal() {
  vibrate();
  const select = document.getElementById('start-vehicle');
  if (!select) return showToast('UI error: missing vehicle selector', 'error');

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
      target_hours: targetHours || null,
      status: 'active'
    };

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

    syncPauseButtonUI('active');
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

  if (!state.activeShift?.id) return showToast('Nėra aktyvios pamainos', 'warning');

  const endOdoRaw = document.getElementById('end-odo')?.value;
  const earnRaw = document.getElementById('end-earn')?.value;
  const weather = document.getElementById('end-weather')?.value || 'sunny';

  if (endOdoRaw === '' || endOdoRaw == null) return showToast('Įveskite ridą', 'warning');
  if (earnRaw === '' || earnRaw == null) return showToast('Įveskite uždarbį', 'warning');

  const endOdo = parseInt(endOdoRaw || '0', 10) || 0;
  const earn = parseFloat(earnRaw || '0') || 0;

  state.loading = true;
  try {
    // If paused: close open pause (if table exists)
    await ensurePauseClosedIfNeeded(state.activeShift.id);

    stopTimer();

    const { error } = await db
      .from('finance_shifts')
      .update({
        end_time: new Date().toISOString(),
        end_odo: endOdo || (state.activeShift.start_odo || 0),
        gross_earnings: earn,
        status: 'completed',
        weather
      })
      .eq('id', state.activeShift.id);

    if (error) throw error;

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
// PAUSE / RESUME
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
  vibrate();
  const s = state.activeShift;
  if (!s?.id) return;

  // normalize status so old values don't break
  s.status = normalizeStatus(s.status);

  // load pauses (if table exists)
  await syncPausesFromDB_SAFE(s.id);

  const newStatus = s.status === 'active' ? 'paused' : 'active';

  // Immediate UI feedback (even if DB fails)
  s.status = newStatus;
  syncPauseButtonUI(newStatus);

  if (newStatus === 'paused') {
    stopTimer();
  } else {
    startTimer();
  }
  updateTimerDisplay();

  // Persist shift status (this should exist)
  try {
    const { error: stErr } = await db
      .from('finance_shifts')
      .update({ status: newStatus })
      .eq('id', s.id);

    if (stErr) throw stErr;
  } catch (e) {
    showToast(e?.message || 'Pause status update failed', 'error');
  }

  // Persist pause rows (optional; can fail if table missing)
  try {
    if (newStatus === 'paused') {
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
      pauseRows.push({ id: data.id, start_time: data.start_time, end_time: data.end_time });
      pauseLoadedForShiftId = String(s.id);
    } else {
      const pid = openPauseId || findOpenPauseId();
      if (pid) {
        const { error } = await db
          .from('finance_shift_pauses')
          .update({ end_time: new Date().toISOString() })
          .eq('id', pid);

        if (error) throw error;

        pauseRows = pauseRows.map(p =>
          String(p.id) === String(pid) ? { ...p, end_time: new Date().toISOString() } : p
        );
        openPauseId = null;
      }
    }
  } catch (e) {
    // This is the typical “table missing / RLS” case.
    // UI already paused/resumed, but analytics won't have pause breakdown.
    showToast('Pause DB log neveikia (trūksta lentelės/RLS)', 'warning');
  }
}

function syncPauseButtonUI(status) {
  const btn = getPauseBtn();
  if (!btn) return;

  const paused = status === 'paused';

  // icon swap: pause -> play
  // support both <button> innerHTML and <i> child
  try {
    if (paused) {
      btn.innerHTML = '<i class="fa-solid fa-play"></i>';
      btn.classList.add('bg-yellow-500/20', 'text-yellow-500');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      btn.classList.remove('bg-yellow-500/20', 'text-yellow-500');
    }
  } catch (_) {}
}

function findOpenPauseId() {
  const open = pauseRows.find(p => !p.end_time);
  return open?.id || null;
}

async function syncPausesFromDB_SAFE(shiftId) {
  try {
    await syncPausesFromDB(shiftId);
  } catch (_) {
    // ignore: table may not exist or RLS
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

  const open = pauseRows.find(p => !p.end_time);
  openPauseId = open?.id || null;

  pauseLoadedForShiftId = sid;
}

async function ensurePauseClosedIfNeeded(shiftId) {
  await syncPausesFromDB_SAFE(shiftId);

  const pid = openPauseId || findOpenPauseId();
  if (!pid) return;

  try {
    await db
      .from('finance_shift_pauses')
      .update({ end_time: new Date().toISOString() })
      .eq('id', pid);

    pauseRows = pauseRows.map(p =>
      String(p.id) === String(pid) ? { ...p, end_time: new Date().toISOString() } : p
    );
    openPauseId = null;
  } catch (_) {
    // ignore if table missing
  }
}

// ────────────────────────────────────────────────────────────────
// TIMER
// ────────────────────────────────────────────────────────────────

export function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  const s = state.activeShift;
  if (s?.id) {
    syncPausesFromDB_SAFE(s.id)
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
  if (timerEl) timerEl.classList.add('opacity-50');
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

  // target
  const targetHours = parseFloat(s.target_hours || 0) || 0;
  const targetMs = targetHours > 0 ? targetHours * 60 * 60 * 1000 : 0;
  const remainMs = targetMs > 0 ? Math.max(0, targetMs - activeMs) : 0;

  // optional multi-displays
  const elTotal = document.getElementById('shift-timer-total');
  const elActive = document.getElementById('shift-timer-active');
  const elRemain = document.getElementById('shift-timer-remaining');

  if (elTotal) elTotal.textContent = fmtHMS(totalMs);
  if (elActive) elActive.textContent = fmtHMS(activeMs);
  if (elRemain) elRemain.textContent = targetMs > 0 ? fmtHMS(remainMs) : '--:--:--';

  // main timer shows ACTIVE (useful)
  const el = document.getElementById('shift-timer');
  if (el) el.textContent = fmtHMS(activeMs);

  // paused look
  if (normalizeStatus(s.status) === 'paused') {
    if (el) el.classList.add('opacity-50');
  } else {
    if (el) el.classList.remove('opacity-50');
  }
}

function sumPauseMs(endOrNowMs) {
  if (!pauseRows?.length) return 0;

  let sum = 0;
  for (const p of pauseRows) {
    const ps = new Date(p.start_time).getTime();
    const pe = p.end_time ? new Date(p.end_time).getTime() : endOrNowMs;
    if (Number.isFinite(ps) && Number.isFinite(pe) && pe > ps) sum += (pe - ps);
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

// ────────────────────────────────────────────────────────────────
// GLOBAL HOOKS (CRITICAL for phone-friendly onclick)
// ────────────────────────────────────────────────────────────────

// If your HTML has onclick="pauseShift()" it MUST exist on window.
try {
  window.pauseShift = togglePause;
  window.togglePauseShift = togglePause;
  window.togglePause = togglePause;
} catch (_) {}
