// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.0.0
// Purpose: Shift lifecycle (start/pause/end) + odometer rules + last_odo sync (schema-safe)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// ────────────────────────────────────────────────────────────────
// ODOMETER HELPERS
// ────────────────────────────────────────────────────────────────

function getVehicleById(id) {
    return (state.fleet || []).find(v => String(v.id) === String(id)) || null;
}

function getVehicleOdoSeed(vehicle) {
    if (!vehicle) return 0;

    const last = parseInt(vehicle.last_odo ?? '', 10);
    if (Number.isFinite(last) && last > 0) return last;

    const init = parseInt(vehicle.initial_odo ?? '', 10);
    if (Number.isFinite(init) && init > 0) return init;

    return 0;
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value === 0 ? '' : String(value);
}

async function getVehicleLastOdo(vehicleId) {
    // Prefer state cache
    const v = getVehicleById(vehicleId);
    const cached = parseInt(v?.last_odo ?? '', 10);
    if (Number.isFinite(cached) && cached >= 0) return cached;

    // Fallback to DB (schema-safe: only select last_odo)
    const { data, error } = await db
        .from('vehicles')
        .select('last_odo')
        .eq('id', vehicleId)
        .eq('user_id', state.user.id)
        .maybeSingle();

    if (error) throw error;

    const dbVal = parseInt(data?.last_odo ?? '', 10);
    return Number.isFinite(dbVal) && dbVal >= 0 ? dbVal : 0;
}

async function ensureActiveShift() {
    if (state.activeShift?.id) return state.activeShift;
    if (!state.user?.id) return null;

    const { data, error } = await db
        .from('finance_shifts')
        .select('*')
        .in('status', ['active', 'paused'])
        .eq('user_id', state.user.id)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    state.activeShift = data || null;
    return state.activeShift;
}

// ────────────────────────────────────────────────────────────────
// START SHIFT
// ────────────────────────────────────────────────────────────────

export function openStartModal() {
    vibrate();

    const select = document.getElementById('start-vehicle');
    const odoInput = document.getElementById('start-odo');

    if (!select) {
        showToast('UI error: missing vehicle selector', 'error');
        return;
    }

    select.innerHTML = (state.fleet || [])
        .map(v => `<option value="${v.id}">${v.name}</option>`)
        .join('');

    const applyOdo = () => {
        const v = getVehicleById(select.value);
        const seed = getVehicleOdoSeed(v);
        if (odoInput && (odoInput.value === '' || odoInput.value == null)) {
            setInputValue('start-odo', seed);
        }
    };

    if (!select.dataset.odoBound) {
        select.addEventListener('change', () => {
            const v = getVehicleById(select.value);
            const seed = getVehicleOdoSeed(v);
            setInputValue('start-odo', seed);
        });
        select.dataset.odoBound = '1';
    }

    applyOdo();
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
        // ✅ Hard rule: start_odo cannot be less than vehicle.last_odo
        const lastOdo = await getVehicleLastOdo(vehicleId);
        if (startOdo < lastOdo) {
            showToast(`Rida per maža. Paskutinė: ${lastOdo}`, 'warning');
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
    if (!state.activeShift) {
        showToast('NĖRA AKTYVIOS PAMAINOS', 'warning');
        return;
    }

    const endOdoEl = document.getElementById('end-odo');
    if (endOdoEl && (endOdoEl.value === '' || endOdoEl.value == null)) {
        const seed = parseInt(state.activeShift.start_odo || '0', 10) || 0;
        setInputValue('end-odo', seed);
    }

    openModal('end-modal');
}

export async function confirmEnd() {
    vibrate([20]);

    let s = null;
    try {
        s = await ensureActiveShift();
    } catch (e) {
        showToast(e?.message || 'Shift sync error', 'error');
        return;
    }

    if (!s?.id) {
        showToast('NĖRA AKTYVIOS PAMAINOS', 'warning');
        return;
    }

    const endOdoRaw = document.getElementById('end-odo')?.value;
    const earnRaw = document.getElementById('end-earn')?.value;

    if (endOdoRaw === '' || endOdoRaw == null) return showToast('Įveskite ridą', 'warning');
    if (earnRaw === '' || earnRaw == null) return showToast('Įveskite uždarbį', 'warning');

    const endOdo = parseInt(endOdoRaw || '0', 10) || 0;
    const earn = parseFloat(earnRaw || '0') || 0;

    const startOdo = parseInt(s.start_odo || '0', 10) || 0;
    if (endOdo < startOdo) return showToast('Rida negali būti mažesnė už START', 'warning');

    const washOtherEl = document.getElementById('end-carwash-other');
    const washCostEl = document.getElementById('manual-wash-cost');
    const washOther = washOtherEl ? washOtherEl.checked : false;
    const washCost = (washOther && washCostEl) ? (parseFloat(washCostEl.value || '0') || 0) : 0;

    const weather = document.getElementById('end-weather')?.value || 'sunny';

    state.loading = true;
    try {
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
            .eq('id', s.id);

        if (updErr) throw updErr;

        if (washOther && washCost > 0) {
            const { error: washErr } = await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: s.id,
                type: 'expense',
                category: 'carwash',
                amount: washCost,
                created_at: new Date().toISOString()
            });
            if (washErr) throw washErr;
        }

        // ✅ Update vehicle.last_odo (NO updated_at column!)
        const vehicleId = s.vehicle_id;
        if (vehicleId) {
            const { error: vehErr } = await db
                .from('vehicles')
                .update({ last_odo: endOdo })
                .eq('id', vehicleId)
                .eq('user_id', state.user.id);

            if (vehErr) throw vehErr;

            const v = getVehicleById(vehicleId);
            if (v) v.last_odo = endOdo;
        }

        showToast('END SHIFT', 'success');
        state.activeShift = null;
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) {
        showToast(e?.message || 'End error', 'error');
        window.dispatchEvent(new Event('refresh-data'));
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// PAUSE / RESUME
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
    vibrate();

    let s = null;
    try {
        s = await ensureActiveShift();
    } catch (e) {
        showToast(e?.message || 'Shift sync error', 'error');
        return;
    }

    if (!s?.id) {
        showToast('NĖRA AKTYVIOS PAMAINOS', 'warning');
        return;
    }

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
// WEATHER
// ────────────────────────────────────────────────────────────────

export function selectWeather(type) {
    vibrate();
    document.querySelectorAll('.weather-btn').forEach(b => {
        b.classList.remove('border-teal-500', 'bg-teal-500/20');
    });
    const hidden = document.getElementById('end-weather');
    if (hidden) hidden.value = type;
}
