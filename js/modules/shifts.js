// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.2.1
// Pause DB log: supports BOTH schemas:
//   A) started_at / ended_at
//   B) start_time / end_time
// Uses auto-detect (caches chosen column names after first DB error)
// Stable timers (DB-driven): active = (now-start) - paused
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// Pause column mapping (auto detected)
const pauseCols = {
  start: 'started_at',
  end: 'ended_at',
  detected: false
};

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
// Pause schema auto-detect
// ────────────────────────────────────────────────────────────────

function isMissingColumnError(e) {
  const msg = String(e?.message || e || '');
  return msg.includes('does not exist') && msg.includes('finance_shift_pauses');
}

function adaptPauseColsFromError(e) {
  const msg = String(e?.message || e || '');
  // If it complains about started_at, switch to start_time/end_time
  if (msg.includes('.started_at') || msg.includes('started_at')) {
    pauseCols.start = 'start_time';
    pauseCols.end = 'end_time';
    pauseCols.detected = true;
    return true;
  }
  // If it complains about start_time, switch back
  if (msg.includes('.start_time') || msg.includes('start_time')) {
    pauseCols.start = 'started_at';
    pauseCols.end = 'ended_at';
    pauseCols.detected = true;
    return true;
  }
  return false;
}

async function selectPauses(shiftId) {
  // Tries current mapping; if fails due to missing column, flips mapping and retries once
  const sel = `id, ${pauseCols.start}, ${pauseCols.end}`;

  const attempt = async () => {
    const { data, error } = await db
      .from('finance_shift_pauses')
      .select(sel)
      .eq('shift_id', shiftId);

    if (error) throw error;
    return data || [];
  };

  try {
    return await attempt();
  } catch (e) {
    if (isMissingColumnError(e) && adaptPauseColsFromError(e)) {
      // retry with new mapping
      const sel2 = `id, ${pauseCols.start}, ${pauseCols.end}`;
      const { data, error } = await db
        .from('finance_shift_pauses')
        .select(sel2)
        .eq('shift_id', shiftId);

      if (error) throw error;
      return data || [];
    }
    throw e;
  }
}

async function getOpenPauseRow(shiftId) {
  const sel = `id, ${pauseCols.start}, ${pauseCols.end}`;

  const attempt = async () => {
    const { data, error } = await db
      .from('finance_shift_pauses')
      .select(sel)
      .eq('shift_id', shiftId)
      .is(pauseCols.end, null)
      .order(pauseCols.start, { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  };

  try {
    return await attempt();
  } catch (e) {
    if (isMissingColumnError(e) && adaptPauseColsFromError(e)) {
      const sel2 = `id, ${pauseCols.start}, ${pauseCols.end}`;
      const { data, error } = await db
        .from('finance_shift_pauses')
        .select(sel2)
        .eq('shift_id', shiftId)
        .is(pauseCols.end, null)
        .order(pauseCols.start, { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    }
    throw e;
  }
}

async function getTotalPausedMs(shiftId) {
  const rows = await selectPauses(shiftId);
  let total = 0;
  const now = Date.now();

  rows.forEach(p => {
    const a = p[pauseCols.start] ? new Date(p[pauseCols.start]).getTime() : null;
    const b = p[pauseCols.end] ? new Date(p[pauseCols.end]).getTime() : null;
    if (!a) return;
    total += (b ? b : now) - a;
  });

  return Math.max(0, total);
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
    // Close open pause if ending while paused
    const openPause = await getOpenPauseRow(state.activeShift.id);
    if (openPause?.id) {
      const { error: closePauseErr } = await db
        .from('finance_shift_pauses')
        .update({ [pauseCols.end]: new Date().toISOString() })
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
    const openPause = await getOpenPauseRow(s.id);
    const isPaused = !!openPause;

    if (!isPaused) {
      // Start pause
      const { error: insErr } = await db
        .from('finance_shift_pauses')
        .insert({
          user_id: state.user.id,
          shift_id: s.id,
          [pauseCols.start]: new Date().toISOString()
        });

      if (insErr) throw insErr;

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
      // Resume (close pause)
      const { error: updErr } = await db
        .from('finance_shift_pauses')
        .update({ [pauseCols.end]: new Date().toISOString() })
        .eq('id', openPause.id);

      if (updErr) throw updErr;

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

    // Timer keeps rendering DB-driven elapsed
    startTimer();
    window.dispatchEvent(new Event('refresh-data'));
  } catch (e) {
    console.error(e);
    showToast(e?.message || 'Pause error', 'error');
    window.dispatchEvent(new Event('refresh-data'));
  } finally {
    state.loading = false;
  }
}

// ────────────────────────────────────────────────────────────────
// TIMER (DB-driven)
// main = Active time (minus pauses)
// optional: #shift-timer-onduty, #shift-timer-paused, #shift-timer-left
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

  const onDutyMs = Math.max(0, nowMs - startMs);
  const pausedMs = await getTotalPausedMs(s.id);
  const activeMs = Math.max(0, onDutyMs - pausedMs);

  const isActive = s.status === 'active';
  setTimerUIActive(isActive);
  setPauseButtonUI(!isActive);

  timerEl.textContent = fmtHMS(activeMs);

  const onDutyEl = document.getElementById('shift-timer-onduty');
  const pausedEl = document.getElementById('shift-timer-paused');
  const leftEl = document.getElementById('shift-timer-left');

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
