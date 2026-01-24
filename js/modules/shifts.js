// ════════════════════════════════════════════════════════════════
// ROBERT OS - SHIFTS MODULE v2.1 (TIMER UI FIX + PAUSE)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let timerInterval = null;

// ────────────────────────────────────────────────────────────────
// TIMER LOGIC (PATAISYTA)
// ────────────────────────────────────────────────────────────────

export function startTimer() {
    stopTimer();
    
    if (state.activeShift?.status === 'paused') {
        const el = document.getElementById('shift-timer');
        if (el) {
            el.textContent = "PAUSED";
            el.classList.add('pulse-text');
        }
        return;
    }
    
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    const el = document.getElementById('shift-timer');
    if (el) {
        el.textContent = "00:00:00";
        el.classList.remove('pulse-text');
    }
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if (!state.activeShift || !el) return;
    
    if (state.activeShift.status === 'paused') {
        el.textContent = "PAUSED";
        el.classList.add('pulse-text');
        return;
    } else {
        el.classList.remove('pulse-text');
    }
    
    const start = new Date(state.activeShift.start_time).getTime();
    const now = Date.now();
    let diff = Math.floor((now - start) / 1000);
    if (diff < 0) diff = 0;
    
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    
    el.textContent = `${h}:${m}:${s}`;
}

// ────────────────────────────────────────────────────────────────
// START SHIFT
// ────────────────────────────────────────────────────────────────

export function openStartModal() {
    vibrate();
    if (state.activeShift) return showToast('Jau turi aktyvią pamainą!', 'error');
    
    const sel = document.getElementById('start-vehicle');
    if (!sel) return;
    
    if (state.fleet.length === 0) {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    } else {
        sel.innerHTML = state.fleet
            .filter(v => v.is_active)
            .map(v => `<option value="${v.id}">${v.name}${v.is_test ? ' 🧪' : ''}</option>`)
            .join('');
    }
    
    document.getElementById('start-odo').value = '';
    document.getElementById('start-goal').value = state.userSettings?.default_shift_target_hours || 12;
    
    window.openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odoInput = document.getElementById('start-odo').value;
    const goal = document.getElementById('start-goal').value;

    if (!vid) return showToast('Pasirink mašiną', 'error');
    if (!odoInput) return showToast('Įvesk ridą', 'error');
    
    const odo = parseInt(odoInput);
    if (isNaN(odo) || odo < 0) return showToast('Neteisinga rida', 'error');

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: odo,
            target_hours: goal ? parseFloat(goal) : null,
            status: 'active',
            start_time: new Date().toISOString()
        });

        if (error) throw error;

        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina pradėta 🚀', 'success');
        
    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// END SHIFT
// ────────────────────────────────────────────────────────────────

export function openEndModal() {
    vibrate();
    if (!state.activeShift) return showToast('Nėra aktyvios pamainos', 'error');
    
    const endOdoInput = document.getElementById('end-odo');
    const endEarnInput = document.getElementById('end-earn');
    const weatherInput = document.getElementById('end-weather');
    
    if (endOdoInput) {
        endOdoInput.value = '';
        endOdoInput.placeholder = `Min: ${state.activeShift.start_odo}`;
    }
    if (endEarnInput) endEarnInput.value = '';
    if (weatherInput) weatherInput.value = '';
    
    document.querySelectorAll('.weather-btn').forEach(btn => {
        btn.classList.remove('bg-teal-500', 'border-teal-500', 'text-black');
        btn.classList.add('opacity-50');
    });
    
    window.openModal('end-modal');
}

export async function confirmEnd() {
    vibrate([20]);
    const odoInput = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    const weather = document.getElementById('end-weather').value;

    if (!odoInput) return showToast('Įvesk ridą', 'error');
    
    const odo = parseInt(odoInput);
    const startOdo = state.activeShift.start_odo;
    
    if (isNaN(odo)) return showToast('Neteisinga rida', 'error');
    if (odo < startOdo) return showToast(`Rida negali būti mažesnė nei ${startOdo}`, 'error');

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: odo,
            end_time: new Date().toISOString(),
            gross_earnings: earn ? parseFloat(earn) : 0,
            weather: weather || null,
            status: 'completed'
        }).eq('id', state.activeShift.id);

        if (error) throw error;

        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina baigta 🏁', 'success');

    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// PAUSE/RESUME (KRITINĖ FUNKCIJA)
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
    vibrate();
    if (!state.activeShift) return;
    
    const isPaused = state.activeShift.status === 'paused';
    const newStatus = isPaused ? 'active' : 'paused';
    
    // Optimistic UI update
    const oldStatus = state.activeShift.status;
    state.activeShift.status = newStatus;
    
    // Update visuals immediately
    if (newStatus === 'paused') {
        stopTimer();
        const el = document.getElementById('shift-timer');
        if (el) {
            el.textContent = "PAUSED";
            el.classList.add('pulse-text');
        }
    } else {
        startTimer();
    }
    
    updatePauseButton(newStatus);
    
    // DB Update
    try {
        const { error } = await db.from('finance_shifts')
            .update({ status: newStatus })
            .eq('id', state.activeShift.id);
        
        if (error) {
            // Rollback on error
            state.activeShift.status = oldStatus;
            if (oldStatus === 'paused') {
                stopTimer();
                const el = document.getElementById('shift-timer');
                if (el) {
                    el.textContent = "PAUSED";
                    el.classList.add('pulse-text');
                }
            } else {
                startTimer();
            }
            updatePauseButton(oldStatus);
            throw error;
        }
        
        showToast(isPaused ? 'Tęsiama ▶️' : 'Pauzė ⏸️', 'info');
        
    } catch (error) {
        console.error('Toggle pause error:', error);
        showToast('Nepavyko pakeisti statuso', 'error');
    }
}

function updatePauseButton(status) {
    const btn = document.getElementById('btn-pause');
    if (!btn) return;
    
    if (status === 'paused') {
        btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        btn.className = 'col-span-1 btn-bento bg-green-500/10 text-green-500 border-green-500/50 transition-all';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        btn.className = 'col-span-1 btn-bento bg-yellow-500/10 text-yellow-500 border-yellow-500/50 transition-all';
    }
} 
