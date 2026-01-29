// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.0.0
// Purpose: Shift lifecycle (start/pause/end) + safe timer + safe modal IO
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

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

    // Optional: auto-fill end odo with start odo if empty
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

    // ✅ Required fields (your flow depends on these)
    if (endOdoRaw === '' || endOdoRaw == null) return showToast('Įveskite ridą', 'warning');
    if (earnRaw === '' || earnRaw == null) return showToast('Įveskite uždarbį', 'warning');

    const endOdo = parseInt(endOdoRaw || '0', 10) || 0;
    const earn = parseFloat(earnRaw || '0') || 0;

    // ✅ SAFE OPTIONAL FIELDS (these inputs are NOT present in your current index.html)
    const washOtherEl = document.getElementById('end-carwash-other');
    const washCostEl = document.getElementById('manual-wash-cost');

    const washOther = washOtherEl ? washOtherEl.checked : false;
    const washCost = (washOther && washCostEl) ? (parseFloat(washCostEl.value || '0') || 0) : 0;

    const weather = document.getElementById('end-weather')?.value || 'sunny';

    state.loading = true;
    try {
        // Stop timer immediately for better UX
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

        // Optional: paid wash expense
        if (washOther && washCost > 0) {
            const { error: washErr } = await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                type: 'expense',
                category: 'carwash',
                amount: washCost,
                created_at: new Date().toISOString()
            });
            if (washErr) throw washErr;
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
    if (!s?.id) return;

    // Optimistic update
    const wasActive = s.status === 'active';
    const newStatus = wasActive ? 'paused' : 'active';
    s.status = newStatus;

    // Immediate UI
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
        // revert via refresh
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

    // Visual highlight (optional)
    document.querySelectorAll('.weather-btn').forEach(b => {
        b.classList.remove('border-teal-500', 'bg-teal-500/20');
    });

    const hidden = document.getElementById('end-weather');
    if (hidden) hidden.value = type;
}
