import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals, updateUI } from './ui.js';

let timerInt;

// --- LAIKMATIS ---
export function startTimer() {
    clearInterval(timerInt);
    
    // Jei pamaina sustabdyta (paused), laikmačio nejungiame
    if (state.activeShift?.status === 'paused') {
        const el = document.getElementById('shift-timer');
        if(el) el.textContent = "PAUSE"; // Arba rodom sustojusį laiką
        return;
    }

    updateTimerDisplay();
    timerInt = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    clearInterval(timerInt);
    const el = document.getElementById('shift-timer');
    if(el) el.textContent = "00:00:00";
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if(!state.activeShift || !el) return;
    
    // Jei statusas 'paused', nerodome tiksinčio laiko
    if (state.activeShift.status === 'paused') {
        el.textContent = "PAUSE";
        return;
    }

    const start = new Date(state.activeShift.start_time).getTime();
    const now = new Date().getTime();
    let diff = Math.floor((now - start) / 1000);
    if (diff < 0) diff = 0;
    
    const h = String(Math.floor(diff/3600)).padStart(2,'0');
    const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
    const s = String(diff%60).padStart(2,'0');
    
    el.textContent = `${h}:${m}:${s}`;
}

// --- MODALAI ---
export function openStartModal() {
    vibrate();
    const sel = document.getElementById('start-vehicle');
    if(state.fleet.length === 0) {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    } else {
        sel.innerHTML = state.fleet.map(v => 
            `<option value="${v.id}">${v.name}${v.is_test ? ' 🧪' : ''}</option>`
        ).join('');
    }
    document.getElementById('start-modal').classList.remove('hidden');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    
    if(!vid) return showToast('Pasirink mašiną', 'error');
    if(!odo) return showToast('Įvesk ridą', 'error');
    
    state.loading = true;
    try {
        // DB pati įrašys user_id (default)
        const { error } = await db.from('finance_shifts').insert({
            vehicle_id: vid,
            start_odo: parseInt(odo), 
            status: 'active',
            start_time: new Date().toISOString()
        });

        if (error) throw error;

        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina pradėta 🚀', 'success');
    } catch(e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

export function openEndModal() { 
    vibrate();
    // Įdedame esamą ridą kaip "hint" (sufleriavimą)
    const endOdoInput = document.getElementById('end-odo');
    if(state.activeShift && state.activeShift.start_odo) {
        endOdoInput.placeholder = `Min: ${state.activeShift.start_odo}`;
        // Galime net automatiškai įrašyti pradinę ridą, kad nereiktų visko vesti
        // endOdoInput.value = state.activeShift.start_odo; 
    }
    document.getElementById('end-modal').classList.remove('hidden'); 
}

export async function confirmEnd() {
    vibrate([20]);
    const odoInput = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    
    if(!odoInput) return showToast('Įvesk ridą', 'error');
    
    // --- 1. SVARBUS PATAISYMAS: Ridos validacija ---
    const endOdo = parseInt(odoInput);
    const startOdo = state.activeShift.start_odo;

    if (endOdo < startOdo) {
        return showToast(`Klaida! Rida negali būti mažesnė nei startinė (${startOdo})`, 'error');
    }
    // -----------------------------------------------

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: endOdo, 
            gross_earnings: parseFloat(earn || 0),
            end_time: new Date().toISOString(), 
            status: 'completed'
        }).eq('id', state.activeShift.id);
        
        if(error) throw error;
        
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina baigta 🏁', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- 2. PAUZĖS FUNKCIJA ---
export async function togglePause() {
    vibrate();
    if (!state.activeShift) return;

    const isPaused = state.activeShift.status === 'paused';
    const newStatus = isPaused ? 'active' : 'paused';

    // UI iškart sureaguoja (optimistinis atnaujinimas)
    state.activeShift.status = newStatus;
    if (newStatus === 'paused') {
        clearInterval(timerInt);
        const el = document.getElementById('shift-timer');
        if(el) el.textContent = "PAUSE";
        updateUI('activeShift'); // Atnaujina mygtuko tekstą
    } else {
        startTimer();
        updateUI('activeShift');
    }

    try {
        const { error } = await db.from('finance_shifts')
            .update({ status: newStatus })
            .eq('id', state.activeShift.id);

        if (error) {
            // Jei nepavyko, grąžiname atgal
            state.activeShift.status = isPaused ? 'paused' : 'active';
            showToast('Nepavyko pakeisti statuso', 'error');
            window.dispatchEvent(new Event('refresh-data'));
        } else {
            showToast(isPaused ? 'Darbas tęsiamas ▶️' : 'Pertrauka ⏸️', 'info');
        }
    } catch (e) {
        console.error(e);
    }
}
