// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.0.0
// Purpose: Robust shift control + safe modal bindings (no missing DOM crashes)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

export function openStartModal() {
    vibrate();

    const select = document.getElementById('start-vehicle');
    if (select) {
        select.innerHTML = (state.fleet || [])
            .map(v => `<option value="${v.id}">${v.name}</option>`)
            .join('');
    }

    openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);

    const vehicleId = document.getElementById('start-vehicle')?.value || '';
    const startOdoRaw = document.getElementById('start-odo')?.value || '';
    const targetRaw = document.getElementById('start-goal')?.value || '';

    const startOdo = startOdoRaw === '' ? 0 : Number(startOdoRaw);
    const target = targetRaw === '' ? 12 : Number(targetRaw);

    if (!vehicleId) return showToast('Select a vehicle', 'warning');
    if (Number.isNaN(startOdo) || startOdo < 0) return showToast('Invalid odometer', 'error');
    if (Number.isNaN(target) || target <= 0) return showToast('Invalid target hours', 'error');

    state.loading = true;
    try {
        // NOTE: if your DB does NOT have target_hours, remove it from payload.
        // You previously saw schema-cache error for target_hours.
        // So we only include it if you want it AND DB has the column.
        const payload = {
            user_id: state.user.id,
            vehicle_id: vehicleId,
            start_odo: startOdo,
            start_time: new Date().toISOString(),
            status: 'active'
        };

        const { data, error } = await db
            .from('finance_shifts')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

        state.activeShift = data;
        showToast('START SHIFT', 'success');
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) {
        showToast(e?.message || 'Start failed', 'error');
    } finally {
        state.loading = false;
    }
}

export function openEndModal() {
    vibrate();
    if (!state.activeShift) return;
    openModal('end-modal');
}

export async function confirmEnd() {
    vibrate([20]);

    if (!state.activeShift?.id) return showToast('No active shift', 'error');

    const endOdoEl = document.getElementById('end-odo');
    const earnEl = document.getElementById('end-earn');
    const weatherEl = document.getElementById('end-weather');

    const endOdoRaw = endOdoEl?.value ?? '';
    const earnRaw = earnEl?.value ?? '';
    const weather = weatherEl?.value || 'sunny';

    // Require inputs (per your workflow: you said you must enter both)
    if (String(endOdoRaw).trim() === '') return showToast('Enter end odometer', 'warning');
    if (String(earnRaw).trim() === '') return showToast('Enter earnings', 'warning');

    const endOdo = Number(endOdoRaw);
    const earn = Number(earnRaw);

    if (Number.isNaN(endOdo) || endOdo < 0) return showToast('Invalid odometer', 'error');
    if (Number.isNaN(earn) || earn < 0) return showToast('Invalid earnings', 'error');

    // Optional validation: end odo >= start odo (if start odo exists)
    const startOdo = Number(state.activeShift.start_odo || 0);
    if (endOdo < startOdo) return showToast('End odometer < start', 'error');

    state.loading = true;
    try {
        const { error } = await db
            .from('finance_shifts')
            .update({
                end_time: new Date().toISOString(),
                end_odo: endOdo,
                gross_earnings: earn,
                status: 'completed',
                weather
            })
            .eq('id', state.activeShift.id);

        if (error) throw error;

        showToast('END SHIFT', 'success');

        state.activeShift = null;
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) {
        showToast(e?.message || 'End failed', 'error');
    } finally {
        state.loading = false;
    }
}

export async function togglePause() {
    vibrate();

    const s = state.activeShift;
    if (!s?.id) return;

    // Optimistic toggle
    const newStatus = s.status === 'active' ? 'paused' : 'active';
    s.status = newStatus;

    // Immediate UI reaction
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
        // Re-sync from server if update failed
        console.error(e);
        window.dispatchEvent(new Event('refresh-data'));
    }
}

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

export function selectWeather(type) {
    vibrate();
    document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('border-teal-500', 'bg-teal-500/20'));
    document.getElementById('end-weather').value = type;
}
