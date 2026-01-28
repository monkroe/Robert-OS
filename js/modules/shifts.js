// ════════════════════════════════════════════════════════════════
// ROBERT OS - SHIFTS MODULE v2.1.1
// Logic: Snappy UI, Atomic End Shift & CarWash Analytics
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let timerInterval = null;

/* ────────────────────────────────────────────────────────────────
   TIMER
---------------------------------------------------------------- */

export function startTimer() {
    stopTimer(); 
    const el = document.getElementById('shift-timer');
    if (!el) return;
    updateTimerDisplay();
    if (state.activeShift?.status === 'paused') {
        el.classList.add('pulse-text');
        return;
    }
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    const el = document.getElementById('shift-timer');
    if (el) el.classList.remove('pulse-text');
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if (!state.activeShift || !el) return;
    const diff = Math.floor((Date.now() - new Date(state.activeShift.start_time).getTime()) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(Math.max(0, diff % 60)).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
    el.classList.toggle('pulse-text', state.activeShift.status === 'paused');
}

/* ────────────────────────────────────────────────────────────────
   OPERATIONS
---------------------------------------------------------------- */

async function fetchLastOdometer(vehicleId) {
    if (!vehicleId) return 0;
    try {
        const { data, error } = await db.from('finance_shifts').select('end_odo').eq('vehicle_id', vehicleId).eq('status', 'completed').order('end_time', { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        return data?.end_odo || 0;
    } catch (e) { return 0; }
}

export async function openStartModal() {
    vibrate();
    if (state.activeShift) return showToast('Jau turi aktyvią pamainą!', 'error');
    const sel = document.getElementById('start-vehicle');
    const odoInput = document.getElementById('start-odo');
    if (!sel || !odoInput) return;

    sel.innerHTML = state.fleet.length ? state.fleet.map(v => `<option value="${v.id}">${v.name}${v.is_test ? ' 🧪' : ''}</option>`).join('') : '<option value="">Garažas tuščias!</option>';

    const refreshOdo = async () => {
        state.loading = true;
        const lastOdo = await fetchLastOdometer(sel.value);
        odoInput.value = lastOdo;
        odoInput.min = lastOdo;
        odoInput.placeholder = `Min rida: ${lastOdo}`;
        state.loading = false;
    };

    sel.onchange = null; // Hygiene
    sel.onchange = refreshOdo;
    await refreshOdo();
    window.openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = parseInt(document.getElementById('start-odo').value);
    const minOdo = parseInt(document.getElementById('start-odo').min || 0);

    if (!vid) return showToast('Pasirink mašiną', 'error');
    if (isNaN(odo) || odo < minOdo) return showToast(`Rida negali būti mažesnė nei ${minOdo}`, 'error');

    state.loading = true;
    try {
        await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: odo,
            target_hours: parseFloat(document.getElementById('start-goal').value) || 12,
            status: 'active',
            start_time: new Date().toISOString()
        });
        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina pradėta 🚀', 'success');
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export async function confirmEnd() {
    vibrate([20]);
    const odo = parseInt(document.getElementById('end-odo').value);
    const startOdo = state.activeShift.start_odo;
    const earnings = parseFloat(document.getElementById('end-earn').value) || 0;
    const carwashUsed = document.getElementById('end-carwash')?.checked;

    if (isNaN(odo) || odo < startOdo) return showToast(`Rida negali būti mažesnė nei ${startOdo}`, 'error');

    state.loading = true;
    try {
        // 1. Create Base Income Transaction (Critical for Audit Source of Truth)
        if (earnings > 0) {
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                vehicle_id: state.activeShift.vehicle_id,
                type: 'income',
                category: 'bonus',
                amount: earnings,
                note: 'Base Shift Earnings'
            });
        }

        // 2. Log Carwash (0$ analytical expense)
        if (carwashUsed) {
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                vehicle_id: state.activeShift.vehicle_id,
                type: 'expense',
                category: 'maintenance',
                amount: 0,
                note: 'Car Wash Logged'
            });
        }

        // 3. Close Shift Record
        await db.from('finance_shifts').update({
            end_odo: odo,
            end_time: new Date().toISOString(),
            gross_earnings: earnings,
            weather: document.getElementById('end-weather').value || null,
            status: 'completed'
        }).eq('id', state.activeShift.id);

        stopTimer();
        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina baigta 🏁', 'success');
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export async function togglePause() {
    if (!state.activeShift) return;
    vibrate();

    // Optimistic UI Update
    const oldStatus = state.activeShift.status;
    const newStatus = oldStatus === 'paused' ? 'active' : 'paused';
    state.activeShift.status = newStatus;
    window.dispatchEvent(new Event('refresh-data'));

    try {
        const { error } = await db.from('finance_shifts').update({ status: newStatus }).eq('id', state.activeShift.id);
        if (error) throw error;
        showToast(newStatus === 'active' ? 'Tęsiama ▶️' : 'Pauzė ⏸️', 'info');
    } catch (e) {
        state.activeShift.status = oldStatus;
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Klaida sinchronizuojant', 'error');
    }
}


________________________________
Nauja versija

// ════════════════════════════════════════════════════════════════
// ROBERT OS - SHIFTS MODULE v2.1.2
// Logic: Atomic Shift Closure & Snappy UX
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let timerInterval = null;

/* ────────────────────────────────────────────────────────────────
   TIMER
---------------------------------------------------------------- */

export function startTimer() {
    stopTimer(); 
    const el = document.getElementById('shift-timer');
    if (!el) return;
    updateTimerDisplay();
    if (state.activeShift?.status === 'paused') {
        el.classList.add('pulse-text');
        return;
    }
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    const el = document.getElementById('shift-timer');
    if (el) el.classList.remove('pulse-text');
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if (!state.activeShift || !el) return;
    const diff = Math.floor((Date.now() - new Date(state.activeShift.start_time).getTime()) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(Math.max(0, diff % 60)).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
    el.classList.toggle('pulse-text', state.activeShift.status === 'paused');
}

/* ────────────────────────────────────────────────────────────────
   OPERATIONS
---------------------------------------------------------------- */

async function fetchLastOdometer(vehicleId) {
    if (!vehicleId) return 0;
    try {
        const { data, error } = await db.from('finance_shifts').select('end_odo').eq('vehicle_id', vehicleId).eq('status', 'completed').order('end_time', { ascending: false }).limit(1).maybeSingle();
        return data?.end_odo || 0;
    } catch (e) { return 0; }
}

export async function openStartModal() {
    vibrate();
    if (state.activeShift) return showToast('Jau turi aktyvią pamainą!', 'error');
    const sel = document.getElementById('start-vehicle'), odoInput = document.getElementById('start-odo');
    if (!sel || !odoInput) return;

    sel.innerHTML = state.fleet.length ? state.fleet.map(v => `<option value="${v.id}">${v.name}${v.is_test ? ' 🧪' : ''}</option>`).join('') : '<option value="">Garažas tuščias!</option>';

    const refreshOdo = async () => {
        state.loading = true;
        const lastOdo = await fetchLastOdometer(sel.value);
        odoInput.value = lastOdo; odoInput.min = lastOdo;
        state.loading = false;
    };

    sel.onchange = null; sel.onchange = refreshOdo;
    await refreshOdo();
    window.openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = parseInt(document.getElementById('start-odo').value);
    const minOdo = parseInt(document.getElementById('start-odo').min || 0);

    if (!vid) return showToast('Pasirink mašiną', 'error');
    if (isNaN(odo) || odo < minOdo) return showToast(`Rida per maža!`, 'error');

    state.loading = true;
    try {
        await db.from('finance_shifts').insert({
            user_id: state.user.id, vehicle_id: vid, start_odo: odo,
            target_hours: parseFloat(document.getElementById('start-goal').value) || 12,
            status: 'active', start_time: new Date().toISOString()
        });
        window.closeModals(); window.dispatchEvent(new Event('refresh-data'));
        showToast('🚀 Sėkmės kelyje!', 'success');
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export async function confirmEnd() {
    vibrate([20]);
    if (!state.activeShift?.id) return;
    const odo = parseInt(document.getElementById('end-odo').value);
    const earnings = parseFloat(document.getElementById('end-earn').value) || 0;
    const carwashUsed = document.getElementById('end-carwash')?.checked;

    if (isNaN(odo) || odo < state.activeShift.start_odo) return showToast('Rida per maža!', 'error');

    state.loading = true;
    try {
        if (earnings > 0) {
            await db.from('expenses').insert({
                user_id: state.user.id, shift_id: state.activeShift.id, vehicle_id: state.activeShift.vehicle_id,
                type: 'income', category: 'bonus', amount: earnings, note: 'Base Earnings'
            });
        }
        if (carwashUsed) {
            await db.from('expenses').insert({
                user_id: state.user.id, shift_id: state.activeShift.id, vehicle_id: state.activeShift.vehicle_id,
                type: 'expense', category: 'maintenance', amount: 0, note: 'Wash Used'
            });
        }
        await db.from('finance_shifts').update({
            end_odo: odo, end_time: new Date().toISOString(), gross_earnings: earnings,
            weather: document.getElementById('end-weather').value || null, status: 'completed'
        }).eq('id', state.activeShift.id);

        stopTimer(); window.closeModals(); window.dispatchEvent(new Event('refresh-data'));
        showToast('🏁 Pamaina baigta!', 'success');
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export async function togglePause() {
    if (!state.activeShift) return;
    vibrate();
    const oldStatus = state.activeShift.status;
    const newStatus = oldStatus === 'paused' ? 'active' : 'paused';
    state.activeShift.status = newStatus;
    window.dispatchEvent(new Event('refresh-data'));

    try {
        await db.from('finance_shifts').update({ status: newStatus }).eq('id', state.activeShift.id);
        showToast(newStatus === 'active' ? '▶️ Tęsiama' : '⏸️ Pauzė', 'info');
    } catch (e) {
        state.activeShift.status = oldStatus; window.dispatchEvent(new Event('refresh-data'));
        showToast('Klaida', 'error');
    }
}

export function selectWeather(type) {
    vibrate();
    document.getElementById('end-weather').value = type;
    document.querySelectorAll('.weather-btn').forEach(btn => {
        const isMatch = btn.getAttribute('onclick').includes(type);
        btn.classList.toggle('border-teal-500', isMatch);
        btn.classList.toggle('bg-teal-500/20', isMatch);
    });
}
