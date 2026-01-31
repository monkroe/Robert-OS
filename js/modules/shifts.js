// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.2.2
// Purpose: Shift lifecycle (start/pause/end) + safe timer + pause DB log
//
// FIX v2.2.2:
// - selectWeather() now visually highlights selected button
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;
let pauseInFlight = false;

let startMinCache = {};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function toInt(v) {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(v) {
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

function getVehicleById(id) {
  return (state.fleet || []).find(v => String(v.id) === String(id)) || null;
}

function getDefaultTargetHours() {
  const def = Number(state.userSettings?.default_shift_target_hours ?? 12);
  return Number.isFinite(def) && def > 0 ? def : 12;
}

async function fetchVehicleStartMinOdo(vehicleId) {
  if (!state.user?.id || !vehicleId) return 0;

  const key = String(vehicleId);
  if (startMinCache[key] != null) return startMinCache[key];

  let min = 0;

  try {
    const { data, error } = await db
      .from('finance_shifts')
      .select('end_odo, end_time')
      .eq('user_id', state.user.id)
      .eq('vehicle_id', vehicleId)
      .eq('status', 'completed')
      .not('end_odo', 'is', null)
      .order('end_time', { ascending: false })
      .limit(1);

    if (!error && data && data.length) {
      const lastEnd = toInt(data[0]?.end_odo);
      if (lastEnd > min) min = lastEnd;
    }
  } catch (_) {}

  const veh = getVehicleById(vehicleId);
  const vLast = toInt(veh?.last_odo);
  if (vLast > min) min = vLast;

  startMinCache[key] = min;
  return min;
}

async function applyStartMinToUI(vehicleId) {
  const startOdoEl = document.getElementById('start-odo');
  if (!startOdoEl) return;

  const min = await fetchVehicleStartMinOdo(vehicleId);

  startOdoEl.min = String(min);
  startOdoEl.placeholder = `min ${min}`;

  const cur = toInt(startOdoEl.value);
  if (!startOdoEl.value || cur < min) {
    startOdoEl.value = String(min);
  }
}

function applyDefaultTargetToUI() {
  const goalEl = document.getElementById('start-goal');
  if (!goalEl) return;

  if (goalEl.value === '' || goalEl.value == null) {
    goalEl.value = String(getDefaultTargetHours());
  }
}

function setStartVehicleChangeHandler() {
  const select = document.getElementById('start-vehicle');
  if (!select) return;

  select.onchange = async () => {
    vibrate([10]);
    await applyStartMinToUI(select.value);
  };
}

// ────────────────────────────────────────────────────────────────
// START SHIFT
// ────────────────────────────────────────────────────────────────

export async function openStartModal() {
  vibrate();
  startMinCache = {};

  const select = document.getElementById('start-vehicle');
  if (!select) return showToast('UI error: missing vehicle selector', 'error');

  const fleet = state.fleet || [];
  select.innerHTML = fleet.map(v => `<option value="${v.id}">${v.name}</option>`).join('');

  setStartVehicleChangeHandler();
  applyDefaultTargetToUI();

  const initialVehicleId = select.value || fleet[0]?.id;
  if (initialVehicleId) {
    select.value = String(initialVehicleId);
    await applyStartMinToUI(initialVehicleId);
  }

  openModal('start-modal');
}

export async function confirmStart() {
  vibrate([20]);

  const vehicleId = document.getElementById('start-vehicle')?.value;
  const startOdoRaw = document.getElementById('start-odo')?.value;
  const targetRaw = document.getElementById('start-goal')?.value;

  if (!vehicleId) return showToast('Pasirinkite automobilį', 'warning');

  const startOdo = toInt(startOdoRaw);

  const fallbackTarget = getDefaultTargetHours();
  const target = toFloat(targetRaw || String(fallbackTarget)) || fallbackTarget;

  const min = await fetchVehicleStartMinOdo(vehicleId);
  if (startOdo < min) {
    return showToast(`Start rida per maža. Min: ${min}`, 'warning');
  }

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

  // Reset weather selection visually
  document.querySelectorAll('.weather-btn').forEach(b => {
    b.classList.remove('border-teal-500', 'bg-teal-500/20');
  });
  const hiddenWeather = document.getElementById('end-weather');
  if (hiddenWeather) hiddenWeather.value = '';

  openModal('end-modal');
}

export async function confirmEnd() {
  vibrate([20]);

  if (!state.activeShift?.id) return showToast('Nėra aktyvios pamainos', 'warning');

  const endOdoRaw = document.getElementById('end-odo')?.value;
  const earnRaw = document.getElementById('end-earn')?.value;

  if (endOdoRaw === '' || endOdoRaw == null) return showToast('Įveskite ridą', 'warning');
  if (earnRaw === '' || earnRaw == null) return showToast('Įveskite uždarbį', 'warning');

  const endOdo = toInt(endOdoRaw);
  const earn = toFloat(earnRaw);

  const startOdo = toInt(state.activeShift.start_odo);
  if (endOdo < startOdo) {
    return showToast(`Pabaigos rida negali būti mažesnė už start (${startOdo})`, 'warning');
  }

  const weather = document.getElementById('end-weather')?.value || 'sunny';

  state.loading = true;
  try {
    await closeOpenPauseSilently(state.activeShift.id);
    stopTimer();

    const { error: updErr } = await db
      .from('finance_shifts')
      .update({
        end_time: new Date().toISOString(),
        end_odo: endOdo,
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
// PAUSE / RESUME
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
  if (pauseInFlight) return;
  pauseInFlight = true;

  vibrate();

  const s = state.activeShift;
  if (!s?.id) {
    pauseInFlight = false;
    return;
  }

  const btn = document.getElementById('btn-pause');
  if (btn) btn.disabled = true;

  const wasActive = s.status === 'active';
  const newStatus = wasActive ? 'paused' : 'active';
  s.status = newStatus;

  if (btn) {
    if (newStatus === 'active') {
      btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      btn.classList.remove('bg-yellow-500/20', 'text-yellow-500');
      startTimer();
    } else {
      btn.innerHTML = '<i class="fa-solid fa-play"></i>';
      btn.classList.add('bg-yellow-500/20', 'text-yellow-500');
      stopTimer();
    }
  }

  try {
    const { error: sErr } = await db.from('finance_shifts').update({ status: newStatus }).eq('id', s.id);
    if (sErr) throw sErr;

    if (newStatus === 'paused') await beginPauseSafe(s.id);
    else await endPauseSafe(s.id);
  } catch (e) {
    console.error(e);
    window.dispatchEvent(new Event('refresh-data'));
    showToast(e?.message || 'Pause error', 'error');
  } finally {
    pauseInFlight = false;
    if (btn) setTimeout(() => (btn.disabled = false), 250);
  }
}

// ────────────────────────────────────────────────────────────────
// PAUSE DB HELPERS
// ────────────────────────────────────────────────────────────────

async function beginPauseSafe(shiftId) {
  if (!state.user?.id) return;

  const payload = {
    user_id: state.user.id,
    shift_id: shiftId,
    start_time: new Date().toISOString(),
    end_time: null
  };

  const { error } = await db.from('finance_shift_pauses').insert(payload);
  if (!error) return;

  const msg = String(error.message || '');
  const isOpenPauseConflict =
    msg.includes('finance_shift_pauses_one_open_per_shift') ||
    msg.toLowerCase().includes('duplicate key value') ||
    msg.toLowerCase().includes('unique constraint');

  if (!isOpenPauseConflict) throw error;

  const { data: openRow, error: selErr } = await db
    .from('finance_shift_pauses')
    .select('id, start_time')
    .eq('shift_id', shiftId)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;
  if (!openRow) throw error;
}

async function endPauseSafe(shiftId) {
  const { error } = await db
    .from('finance_shift_pauses')
    .update({ end_time: new Date().toISOString() })
    .eq('shift_id', shiftId)
    .is('end_time', null);

  if (error) throw error;
}

async function closeOpenPauseSilently(shiftId) {
  try {
    await db
      .from('finance_shift_pauses')
      .update({ end_time: new Date().toISOString() })
      .eq('shift_id', shiftId)
      .is('end_time', null);
  } catch (_) {}
}

// ────────────────────────────────────────────────────────────────
// TIMER
// ────────────────────────────────────────────────────────────────

export function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
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

function updateTimerDisplay() {
  const s = state.activeShift;
  if (!s || s.status !== 'active') return;

  const start = new Date(s.start_time).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - start);

  const hrs = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  const el = document.getElementById('shift-timer');
  if (el) {
    el.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    el.classList.remove('opacity-50');
    el.classList.add('pulse-text');
  }
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

// ────────────────────────────────────────────────────────────────
// WEATHER (End modal) — v2.2.2 fix: visual highlight
// ────────────────────────────────────────────────────────────────

export function selectWeather(type) {
  vibrate();

  // Remove highlight from all
  document.querySelectorAll('.weather-btn').forEach(b => {
    b.classList.remove('border-teal-500', 'bg-teal-500/20');
  });

  // Find and highlight selected button
  const selected = document.querySelector(`.weather-btn[onclick*="'${type}'"]`);
  if (selected) {
    selected.classList.add('border-teal-500', 'bg-teal-500/20');
  }

  // Set hidden value
  const hidden = document.getElementById('end-weather');
  if (hidden) hidden.value = type;
}
