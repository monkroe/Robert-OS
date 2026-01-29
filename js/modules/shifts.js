// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.1.1
// FIXES:
// ✅ Odometer monotonicity per-vehicle (start/end cannot go below last completed end_odo)
// ✅ End odometer cannot be < start_odo
// ✅ Best-effort update vehicles.last_odo after END (safe if column exists)
// ✅ Keeps your pause logging + double-click guards intact
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// Pause DB locking (prevents double click / double binding)
let pauseInFlight = false;

// ────────────────────────────────────────────────────────────────
// ODOMETER HELPERS (source of truth: finance_shifts history)
// ────────────────────────────────────────────────────────────────

async function getLastCompletedOdo(vehicleId, excludeShiftId = null) {
  if (!state.user?.id || !vehicleId) return 0;

  let q = db
    .from('finance_shifts')
    .select('id, end_odo, end_time')
    .eq('user_id', state.user.id)
    .eq('vehicle_id', vehicleId)
    .not('end_odo', 'is', null)
    .order('end_time', { ascending: false })
    .limit(1);

  if (excludeShiftId) q = q.neq('id', excludeShiftId);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;

  const last = parseInt(data?.end_odo || 0, 10) || 0;
  return last;
}

async function tryUpdateVehicleLastOdo(vehicleId, odo) {
  // Best-effort. If schema/column doesn't exist, ignore silently.
  if (!vehicleId) return;
  try {
    await db
      .from('vehicles')
      .update({ last_odo: odo })
      .eq('id', vehicleId);
  } catch (_) {
    // silent
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
    // ✅ Monotonic guard: start_odo cannot go below last completed end_odo for this vehicle
    const lastOdo = await getLastCompletedOdo(vehicleId);
    if (startOdo > 0 && startOdo < lastOdo) {
      showToast(`Rida per maža. Paskutinė užfiksuota: ${lastOdo}`, 'warning');
      return;
    }

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

  // ✅ Guard 1: end >= start
  const startOdo = parseInt(state.activeShift.start_odo || 0, 10) || 0;
  if (endOdo > 0 && endOdo < startOdo) {
    showToast('Pabaigos rida negali būti mažesnė už pradžios ridą', 'warning');
    return;
  }

  state.loading = true;
  try {
    const vehicleId = state.activeShift.vehicle_id;

    // ✅ Guard 2: end >= last completed end_odo (excluding current shift)
    const lastOdo = await getLastCompletedOdo(vehicleId, state.activeShift.id);
    if (endOdo > 0 && endOdo < lastOdo) {
      showToast(`Rida per maža. Paskutinė užfiksuota: ${lastOdo}`, 'warning');
      return;
    }

    // Ensure no open pause remains (safety)
    await closeOpenPauseSilently(state.activeShift.id);

    stopTimer();

    const { error: updErr } = await db
      .from('finance_shifts')
      .update({
        end_time: new Date().toISOString(),
        end_odo: endOdo || startOdo,
        gross_earnings: earn,
        status: 'completed',
        weather
      })
      .eq('id', state.activeShift.id);

    if (updErr) throw updErr;

    // ✅ Best-effort: store last odo on vehicle record too (if you have that column)
    await tryUpdateVehicleLastOdo(vehicleId, endOdo || startOdo);

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
// PAUSE / RESUME (with DB log safe)
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
  // HARD GUARD: prevents double-insert / double-binding
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

  // Optimistic status change
  const wasActive = s.status === 'active';
  const newStatus = wasActive ? 'paused' : 'active';
  s.status = newStatus;

  // Immediate UI
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
    // 1) update shift status
    const { error: sErr } = await db
      .from('finance_shifts')
      .update({ status: newStatus })
      .eq('id', s.id);

    if (sErr) throw sErr;

    // 2) pause logging
    if (newStatus === 'paused') {
      await beginPauseSafe(s.id);
    } else {
      await endPauseSafe(s.id);
    }
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
// WEATHER (End modal)
// ────────────────────────────────────────────────────────────────

export function selectWeather(type) {
  vibrate();

  // clear active state
  document.querySelectorAll('.weather-btn').forEach(b => {
    b.classList.remove('border-teal-500', 'bg-teal-500/20');
  });

  const hidden = document.getElementById('end-weather');
  if (hidden) hidden.value = type;
}
