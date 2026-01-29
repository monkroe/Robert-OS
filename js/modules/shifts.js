// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.0.1
// Purpose: Shift lifecycle (start/pause/end) + odometer autofill + strict validation
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────

function getVehicleById(id) {
  return (state.fleet || []).find(v => String(v.id) === String(id)) || null;
}

function toInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNum(v, fallback = 0) {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function setIfEmpty(inputEl, value) {
  if (!inputEl) return;
  if (String(inputEl.value ?? '').trim() !== '') return;
  if (value === null || value === undefined) return;
  inputEl.value = String(value);
}

// ────────────────────────────────────────────────────────────────
// START SHIFT
// ────────────────────────────────────────────────────────────────

export function openStartModal() {
  vibrate();

  const select = document.getElementById('start-vehicle');
  const startOdoEl = document.getElementById('start-odo');

  if (!select) {
    showToast('UI error: missing vehicle selector', 'error');
    return;
  }

  // Populate select
  select.innerHTML = (state.fleet || [])
    .map(v => `<option value="${v.id}">${v.name}</option>`)
    .join('');

  // Autofill odo from selected vehicle.last_odo
  const selectedId = select.value || (state.fleet?.[0]?.id ?? '');
  const v = getVehicleById(selectedId);
  const lastOdo = toInt(v?.last_odo, 0);
  setIfEmpty(startOdoEl, lastOdo);

  // Live update when user changes vehicle
  select.onchange = () => {
    const v2 = getVehicleById(select.value);
    const last2 = toInt(v2?.last_odo, 0);
    // overwrite only if user hasn't typed something custom
    if (startOdoEl) startOdoEl.value = String(last2);
  };

  openModal('start-modal');
}

export async function confirmStart() {
  vibrate([20]);

  const vehicleId = document.getElementById('start-vehicle')?.value;
  const startOdoRaw = document.getElementById('start-odo')?.value;
  const targetRaw = document.getElementById('start-goal')?.value;

  if (!vehicleId) return showToast('Pasirinkite automobilį', 'warning');

  const v = getVehicleById(vehicleId);
  const lastOdo = toInt(v?.last_odo, 0);

  const startOdo = toInt(startOdoRaw, lastOdo);
  if (startOdo < lastOdo) {
    showToast(`Start ODO per mažas. Min: ${lastOdo}`, 'warning');
    return;
  }

  const target = toNum(targetRaw, 12) || 12;

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

  if (!state.activeShift?.id) {
    showToast('NĖRA AKTYVIOS PAMAINOS', 'warning');
    return;
  }

  const endOdoEl = document.getElementById('end-odo');
  const v = getVehicleById(state.activeShift.vehicle_id);
  const lastOdo = toInt(v?.last_odo, 0);
  const startOdo = toInt(state.activeShift.start_odo, 0);

  // Autofill end odo with max(start_odo, last_odo)
  const suggested = Math.max(startOdo, lastOdo);
  setIfEmpty(endOdoEl, suggested);

  openModal('end-modal');
}

export async function confirmEnd() {
  vibrate([20]);

  if (!state.activeShift?.id) {
    showToast('NĖRA AKTYVIOS PAMAINOS', 'warning');
    return;
  }

  const endOdoEl = document.getElementById('end-odo');
  const earnEl = document.getElementById('end-earn');

  const endOdoRaw = endOdoEl?.value;
  const earnRaw = earnEl?.value;

  if (endOdoRaw === '' || endOdoRaw == null) return showToast('Įveskite ridą', 'warning');
  if (earnRaw === '' || earnRaw == null) return showToast('Įveskite uždarbį', 'warning');

  const endOdo = toInt(endOdoRaw, 0);
  const earn = toNum(earnRaw, 0);

  const v = getVehicleById(state.activeShift.vehicle_id);
  const lastOdo = toInt(v?.last_odo, 0);
  const startOdo = toInt(state.activeShift.start_odo, 0);

  const minOdo = Math.max(lastOdo, startOdo);
  if (endOdo < minOdo) {
    showToast(`ODO per mažas. Min: ${minOdo} (Start: ${startOdo}, Last: ${lastOdo})`, 'warning');
    return;
  }

  const weather = document.getElementById('end-weather')?.value || 'sunny';

  state.loading = true;
  try {
    stopTimer();

    // 1) complete shift
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

    // 2) update vehicle.last_odo (NO updated_at column usage)
    if (v?.id) {
      const { error: vehErr } = await db
        .from('vehicles')
        .update({ last_odo: endOdo })
        .eq('id', v.id);

      if (vehErr) throw vehErr;

      // update local cache too (so next modal autofill is instant)
      v.last_odo = endOdo;
    }

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
  vibrate();
  const s = state.activeShift;
  if (!s?.id) return showToast('NĖRA AKTYVIOS PAMAINOS', 'warning');

  const wasActive = s.status === 'active';
  const newStatus = wasActive ? 'paused' : 'active';
  s.status = newStatus;

  const btn = document.getElementById('btn-pause');
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
    const { error } = await db.from('finance_shifts').update({ status: newStatus }).eq('id', s.id);
    if (error) throw error;
  } catch (e) {
    console.error(e);
    window.dispatchEvent(new Event('refresh-data'));
  }
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
