// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.1.0
// Purpose: Shift lifecycle (start/pause/end) + safe timer + pause DB log (safe)
// Fix: prevent double INSERT + handle unique constraint one_open_per_shift
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// Pause DB locking (prevents double click / double binding)
let pauseInFlight = false;

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
        // Ensure no open pause remains (safety)
        await closeOpenPauseSilently(state.activeShift.id);

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
        // revert via refresh (source of truth)
        window.dispatchEvent(new Event('refresh-data'));
        showToast(e?.message || 'Pause error', 'error');
    } finally {
        pauseInFlight = false;
        if (btn) {
            // small delay avoids Android “double tap” sending again instantly
            setTimeout(() => (btn.disabled = false), 250);
        }
    }
}

// ────────────────────────────────────────────────────────────────
// PAUSE DB HELPERS
// Table: public.finance_shift_pauses
// Columns assumed: id (uuid), user_id (uuid), shift_id (uuid),
// start_time (timestamptz), end_time (timestamptz nullable)
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

    // If unique constraint complains, it means open pause already exists.
    const msg = String(error.message || '');
    const isOpenPauseConflict =
        msg.includes('finance_shift_pauses_one_open_per_shift') ||
        msg.toLowerCase().includes('duplicate key value') ||
        msg.toLowerCase().includes('unique constraint');

    if (!isOpenPauseConflict) throw error;

    // Fallback: load existing open pause and continue silently
    const { data: openRow, error: selErr } = await db
        .from('finance_shift_pauses')
        .select('id, start_time')
        .eq('shift_id', shiftId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (selErr) throw selErr;

    // If it exists, we're good. If it doesn't, rethrow original.
    if (!openRow) throw error;
}

async function endPauseSafe(shiftId) {
    // Close the currently open pause for this shift, if any.
    const { error } = await db
        .from('finance_shift_pauses')
        .update({ end_time: new Date().toISOString() })
        .eq('shift_id', shiftId)
        .is('end_time', null);

    // If 0 rows updated, it's fine (no open pause)
    if (error) throw error;
}

async function closeOpenPauseSilently(shiftId) {
    try {
        await db
            .from('finance_shift_pauses')
            .update({ end_time: new Date().toISOString() })
            .eq('shift_id', shiftId)
            .is('end_time', null);
    } catch (_) {
        // silent
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
