// ════════════════════════════════════════════════════════════════
// ROBERT OS - SHIFTS MODULE
// Versija: 1.2
// 
// ATSAKOMYBĖ: Pamainos valdymas (Start/End/Pause)
// Timer logika, modalai, validacija
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// PATAISYMAS: Šalinama cirkuliarine importą
// import { closeModals, updateUI } from './ui.js'; ← PAŠALINTA

let timerInterval = null;

// ────────────────────────────────────────────────────────────────
// LAIKMATIS - START
// ────────────────────────────────────────────────────────────────

export function startTimer() {
    stopTimer(); // Išvalyti seną intervalą
    
    // Jei pamaina paused, nerodyti tiksinčio laiko
    if (state.activeShift?.status === 'paused') {
        const el = document.getElementById('shift-timer');
        if (el) el.textContent = "PAUSED";
        return;
    }
    
    updateTimerDisplay(); // Pirmas update iškart
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

// ────────────────────────────────────────────────────────────────
// LAIKMATIS - STOP
// ────────────────────────────────────────────────────────────────

export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    const el = document.getElementById('shift-timer');
    if (el) el.textContent = "00:00:00";
}

// ────────────────────────────────────────────────────────────────
// LAIKMATIS - UPDATE DISPLAY
// ────────────────────────────────────────────────────────────────

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if (!state.activeShift || !el) return;
    
    // Jei paused, nerodyti tiksinčio laiko
    if (state.activeShift.status === 'paused') {
        el.textContent = "PAUSED";
        return;
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
// START MODAL - Atidarymas
// ────────────────────────────────────────────────────────────────

export function openStartModal() {
    vibrate();
    
    // Patikrinti ar nėra aktyvios pamainos
    if (state.activeShift) {
        return showToast('Jau turi aktyvią pamainą!', 'error');
    }
    
    const sel = document.getElementById('start-vehicle');
    if (!sel) return;
    
    if (state.fleet.length === 0) {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    } else {
        sel.innerHTML = state.fleet
            .filter(v => v.is_active) // Tik aktyvūs automobiliai
            .map(v => `<option value="${v.id}">${v.name}${v.is_test ? ' 🧪' : ''}</option>`)
            .join('');
    }
    
    // Išvalyti laukus
    document.getElementById('start-odo').value = '';
    document.getElementById('start-goal').value = state.userSettings?.default_shift_target_hours || 12;
    
    document.getElementById('start-modal').classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// START MODAL - Patvirtinimas
// ────────────────────────────────────────────────────────────────

export async function confirmStart() {
    vibrate([20]);
    
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    const goal = document.getElementById('start-goal').value;
    
    // Validacija
    if (!vid) return showToast('Pasirink mašiną', 'error');
    if (!odo) return showToast('Įvesk ridą', 'error');
    
    const startOdo = parseInt(odo);
    if (isNaN(startOdo) || startOdo < 0) {
        return showToast('Neteisinga rida', 'error');
    }
    
    state.loading = true;
    
    try {
        const { error } = await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: startOdo,
            target_hours: goal ? parseFloat(goal) : null,
            status: 'active',
            start_time: new Date().toISOString()
        });
        
        if (error) throw error;
        
        closeModals(); // PATAISYMAS: Tiesioginis kvietimas
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina pradėta 🚀', 'success');
        
    } catch (error) {
        console.error('Start shift error:', error);
        showToast(error.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// END MODAL - Atidarymas
// ────────────────────────────────────────────────────────────────

export function openEndModal() {
    vibrate();
    
    if (!state.activeShift) {
        return showToast('Nėra aktyvios pamainos', 'error');
    }
    
    // Išvalyti laukus
    const endOdoInput = document.getElementById('end-odo');
    const endEarnInput = document.getElementById('end-earn');
    const weatherInput = document.getElementById('end-weather');
    
    if (endOdoInput) {
        endOdoInput.value = '';
        endOdoInput.placeholder = `Min: ${state.activeShift.start_odo}`;
    }
    
    if (endEarnInput) endEarnInput.value = '';
    if (weatherInput) weatherInput.value = '';
    
    // Išvalyti weather selector highlight
    document.querySelectorAll('.weather-btn').forEach(btn => {
        btn.classList.remove('bg-teal-500', 'border-teal-500', 'text-black');
        btn.classList.add('opacity-50');
    });
    
    document.getElementById('end-modal').classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// END MODAL - Patvirtinimas
// ────────────────────────────────────────────────────────────────

export async function confirmEnd() {
    vibrate([20]);
    
    const odoInput = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    const weather = document.getElementById('end-weather').value;
    
    // Validacija
    if (!odoInput) return showToast('Įvesk ridą', 'error');
    
    const endOdo = parseInt(odoInput);
    const startOdo = state.activeShift.start_odo;
    
    if (isNaN(endOdo)) {
        return showToast('Neteisinga rida', 'error');
    }
    
    if (endOdo < startOdo) {
        return showToast(`Rida negali būti mažesnė nei ${startOdo}`, 'error');
    }
    
    state.loading = true;
    
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: endOdo,
            end_time: new Date().toISOString(),
            gross_earnings: earn ? parseFloat(earn) : 0,
            weather: weather || null,
            status: 'completed'
        }).eq('id', state.activeShift.id);
        
        if (error) throw error;
        
        closeModals(); // PATAISYMAS: Tiesioginis kvietimas
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina baigta 🏁', 'success');
        
    } catch (error) {
        console.error('End shift error:', error);
        showToast(error.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// PAUSE/RESUME
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
    vibrate();
    
    if (!state.activeShift) return;
    
    const isPaused = state.activeShift.status === 'paused';
    const newStatus = isPaused ? 'active' : 'paused';
    
    // Optimistinis UI update
    const oldStatus = state.activeShift.status;
    state.activeShift.status = newStatus;
    
    // Atnaujinti laikmatį
    if (newStatus === 'paused') {
        stopTimer();
        const el = document.getElementById('shift-timer');
        if (el) el.textContent = "PAUSED";
    } else {
        startTimer();
    }
    
    // Atnaujinti mygtuko išvaizdą (be UI importo)
    updatePauseButton(newStatus);
    
    // Išsaugoti DB
    try {
        const { error } = await db.from('finance_shifts')
            .update({ status: newStatus })
            .eq('id', state.activeShift.id);
        
        if (error) {
            // Rollback jei klaida
            state.activeShift.status = oldStatus;
            if (oldStatus === 'paused') {
                stopTimer();
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

// ────────────────────────────────────────────────────────────────
// HELPER: Update Pause Button (be UI importo)
// ────────────────────────────────────────────────────────────────

function updatePauseButton(status) {
    const btn = document.getElementById('btn-pause');
    if (!btn) return;
    
    if (status === 'paused') {
        // Resume mygtukas
        btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        btn.classList.remove('bg-yellow-500/10', 'text-yellow-500', 'border-yellow-500/50');
        btn.classList.add('bg-green-500/10', 'text-green-500', 'border-green-500/50');
    } else {
        // Pause mygtukas
        btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        btn.classList.remove('bg-green-500/10', 'text-green-500', 'border-green-500/50');
        btn.classList.add('bg-yellow-500/10', 'text-yellow-500', 'border-yellow-500/50');
    }
}

// ────────────────────────────────────────────────────────────────
// HELPER: Close Modals (be UI importo)
// ────────────────────────────────────────────────────────────────

function closeModals() {
    vibrate();
    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.classList.add('hidden');
    });
}
