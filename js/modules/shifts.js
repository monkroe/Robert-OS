// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.2.0
// Purpose: Shift lifecycle + Pause DB log (finance_shift_pauses) + stable timers
// Notes: DB-driven time calc => refresh no longer "resets" real elapsed time
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function fmtHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

async function getTotalPausedMs(shiftId) {
  // Sum all completed pauses + include currently open pause
  const { data, error } = await db
    .from('finance_shift_pauses')
    .select('started_at, ended_at')
    .eq('shift_id', shiftId);

  if (error) throw error;

  let total = 0;
  const now = Date.now();

  (data || []).forEach(p => {
    const a = p.started_at ? new Date(p.started_at).getTime() : null;
    const b = p.ended_at ? new Date(p.ended_at).getTime() : null;
    if (!a) return;
    total += (b ? b : now) - a;
  });

  return Math.max(0, total);
}

async function getOpenPauseRow(shiftId) {
  // Get currently open pause (if any)
  const { data, error } = await db
    .from('finance_shift_pauses')
    .select('id, started_at, ended_at')
    .eq('shift_id', shiftId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function setPauseButtonUI(isPaused) {
  const btn = document.getElementById('btn-pause');
  if (!btn) return;

  if (isPaused) {
    btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    btn.classList.add('bg-yellow-500/20', 'text-yellow-500');
  } else {
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    btn.classList.remove('bg-yellow-500/20', 'text-yellow-500');
  }
}

function setTimerUIActive(isActive) {
  const el = document.getElementById('shift-timer');
  if (!el) return;
  if (isActive) {
    el.classList.remove('opacity-50');
    el.classList.add('pulse-text');
  } else {
    el.classList.add('opacity-50');
    el.classList.remove('pulse-text');
  }
}

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
  const targetRaw = document.getElementById('start-goal')?.value;

  if (!vehicleId) return showToast('Pasirinkite automobilį', 'warning');

  const startOdo = parseInt(startOdoRaw || '0', 10) || 0;
  const target = parseFloat(targetRaw || '12') || 12;

  state.loading = true;
  try {
    const { data, error } = await db
      .from('finance_shifts')
      .insert({
        user_id: state.user.id,
        vehicle_id: vehicleId,
        start_odo: startOdo,
        start_time: new Date().toISOString(),
        target_hours: target,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    state.activeShift = data;
    showToast('START SHIFT', 'success');
    closeModals();
    window.dispatchEvent(new Event('refresh-data'));

    // start timer
    startTimer();
    setPauseButtonUI(false);
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
    // Close an open pause if user ends while paused
    const openPause = await getOpenPauseRow(state.activeShift.id);
    if (openPause?.id) {
      const { error: closePauseErr } = await db
        .from('finance_shift_pauses')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', openPause.id);
      if (closePauseErr) throw closePauseErr;
    }

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
    state.activeShift = null;
    closeModals();
    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    showToast(e?.message || 'End error', 'error');
  } finally {
    state.loading = false;
  }
}

// ────────────────────────────────────────────────────────────────
// PAUSE / RESUME (with DB log)
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
  vibrate();

  const s = state.activeShift;
  if (!s?.id) return showToast('Nėra aktyvios pamainos', 'warning');

  state.loading = true;

  try {
    // Determine current true pause state from DB (not from UI)
    const openPause = await getOpenPauseRow(s.id);
    const isPaused = !!openPause;

    if (!isPaused) {
      // Start pause: insert a pause row
      const { error: insErr } = await db
        .from('finance_shift_pauses')
        .insert({
          user_id: state.user.id,
          shift_id: s.id,
          started_at: new Date().toISOString()
        });

      if (insErr) throw insErr;

      // Update shift status
      const { error: stErr } = await db
        .from('finance_shifts')
        .update({ status: 'paused' })
        .eq('id', s.id);

      if (stErr) throw stErr;

      s.status = 'paused';
      setPauseButtonUI(true);
      setTimerUIActive(false);
      showToast('PAUSED', 'info');
    } else {
      // Resume: close pause row
      const { error: updErr } = await db
        .from('finance_shift_pauses')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', openPause.id);

      if (updErr) throw updErr;

      // Update shift status
      const { error: stErr } = await db
        .from('finance_shifts')
        .update({ status: 'active' })
        .eq('id', s.id);

      if (stErr) throw stErr;

      s.status = 'active';
      setPauseButtonUI(false);
      setTimerUIActive(true);
      showToast('RESUMED', 'success');
    }

    // Keep timer running always (it renders DB-driven elapsed)
    // but UI becomes "inactive" when paused
    startTimer();

    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    console.error(e);
    showToast(e?.message || 'Pause error', 'error');
    // Re-sync from DB
    window.dispatchEvent(new Event('refresh-data'));
  } finally {
    state.loading = false;
  }
}

// ────────────────────────────────────────────────────────────────
// TIMER (DB-driven: on-duty minus pauses)
// ────────────────────────────────────────────────────────────────

export function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  renderTimers().catch(() => {});
  timerInterval = setInterval(() => {
    renderTimers().catch(() => {});
  }, 1000);
}

export function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  setTimerUIActive(false);
}

async function renderTimers() {
  const s = state.activeShift;
  if (!s?.start_time) return;

  const timerEl = document.getElementById('shift-timer');
  if (!timerEl) return;

  const startMs = new Date(s.start_time).getTime();
  const nowMs = Date.now();

  // Total elapsed from start to now (on duty, raw)
  const onDutyMs = Math.max(0, nowMs - startMs);

  // Pause time from DB
  const pausedMs = await getTotalPausedMs(s.id);

  // Active working time (excludes pauses)
  const activeMs = Math.max(0, onDutyMs - pausedMs);

  // Decide UI state by shift status
  const isActive = s.status === 'active';
  setTimerUIActive(isActive);
  setPauseButtonUI(!isActive); // if paused => play icon

  // Show main timer as ACTIVE time (with pauses excluded)
  timerEl.textContent = fmtHMS(activeMs);

  // OPTIONAL: if you have extra labels in DOM, fill them
  // (won't error if not present)
  const onDutyEl = document.getElementById('shift-timer-onduty');
  const pausedEl = document.getElementById('shift-timer-paused');
  const leftEl = document.getElementById('shift-timer-left'); // countdown to target_hours

  if (onDutyEl) onDutyEl.textContent = fmtHMS(onDutyMs);
  if (pausedEl) pausedEl.textContent = fmtHMS(pausedMs);

  const targetHours = Number(s.target_hours || 0);
  if (leftEl && targetHours > 0) {
    const targetMs = targetHours * 3600 * 1000;
    const leftMs = Math.max(0, targetMs - activeMs);
    leftEl.textContent = fmtHMS(leftMs);
  }
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
