// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.8.0
// Logic: Robust Shift Control
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

export function openStartModal() {
    vibrate();
    const select = document.getElementById('start-vehicle');
    select.innerHTML = state.fleet.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);
    const vehicleId = document.getElementById('start-vehicle').value;
    const startOdo = document.getElementById('start-odo').value;
    const target = document.getElementById('start-goal').value || 12;

    if (!vehicleId) return showToast('Pasirinkite automobilį', 'warning');
    
    state.loading = true;
    try {
        const { data, error } = await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vehicleId,
            start_odo: startOdo || 0,
            start_time: new Date().toISOString(),
            target_hours: target,
            status: 'active'
        }).select().single();

        if (error) throw error;
        state.activeShift = data;
        showToast('START SHIFT', 'success');
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export function openEndModal() {
    vibrate();
    if (!state.activeShift) return;
    openModal('end-modal');
}

export async function confirmEnd() {
    vibrate([20]);
    const endOdo = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    const washOther = document.getElementById('end-carwash-other').checked;
    const washCost = washOther ? (document.getElementById('manual-wash-cost').value || 0) : 0;
    const weather = document.getElementById('end-weather').value || 'sunny';

    state.loading = true;
    try {
        await db.from('finance_shifts').update({
            end_time: new Date().toISOString(),
            end_odo: endOdo || state.activeShift.start_odo,
            gross_earnings: earn || 0,
            status: 'completed',
            weather: weather
        }).eq('id', state.activeShift.id);

        if (washOther && washCost > 0) {
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                type: 'expense',
                category: 'carwash',
                amount: washCost,
                created_at: new Date().toISOString()
            });
        }

        showToast('END SHIFT', 'success');
        state.activeShift = null;
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export async function togglePause() {
    vibrate();
    const s = state.activeShift;
    if (!s) return;

    // Optimistic Update
    const wasActive = s.status === 'active';
    const newStatus = wasActive ? 'paused' : 'active';
    s.status = newStatus;

    // Trigger visual change immediately
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
        await db.from('finance_shifts').update({ status: newStatus }).eq('id', s.id);
    } catch (e) {
        console.error(e);
        window.dispatchEvent(new Event('refresh-data')); // Revert on error
    }
}

export function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
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
    const now = new Date().getTime();
    const diff = now - start;
    
    // Simple duration calc (can be improved with paused_at tracking later)
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

function pad(n) { return n < 10 ? '0' + n : n; }

export function selectWeather(type) {
    vibrate();
    document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('border-teal-500', 'bg-teal-500/20'));
    document.getElementById('end-weather').value = type;
}
