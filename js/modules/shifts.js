// shifts.js - Robert OS v1.1
import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals, updateUI } from './ui.js';

let timerInt;

// --- LAIKMATIS ---
export function startTimer() {
    clearInterval(timerInt);
    
    if (!state.activeShift) return;

    updateTimerDisplay();
    timerInt = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    clearInterval(timerInt);
    const el = document.getElementById('shift-timer');
    if(el) el.innerHTML = `<div class="val-timer">00:00:00</div>`;
}

// --- NAUJAS UPDATE TIMER DISPLAY ---
function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if(!state.activeShift || !el) return;

    const now = new Date().getTime();
    const start = new Date(state.activeShift.start_time).getTime();
    const elapsedSeconds = Math.floor((now - start) / 1000);

    // --- Pauzės logika ---
    const isPaused = state.activeShift.status === 'paused';
    let pauseText = '';
    if(isPaused) {
        pauseText = `<span class="pulse">⏸️ Pauzė</span>`;
    }

    // --- Duty Time (visas laikas nuo starto, nepaisant pauzių) ---
    const dutyH = Math.floor(elapsedSeconds / 3600);
    const dutyM = Math.floor((elapsedSeconds % 3600) / 60);
    const dutyS = elapsedSeconds % 60;

    const dutyTimeStr = `${String(dutyH).padStart(2,'0')}:${String(dutyM).padStart(2,'0')}:${String(dutyS).padStart(2,'0')}`;

    // --- Tikslas laikui ---
    let targetHours = state.activeShift.target_time || 12; // default 12h
    const remainingSeconds = Math.max(0, targetHours*3600 - elapsedSeconds);
    const remH = Math.floor(remainingSeconds / 3600);
    const remM = Math.floor((remainingSeconds % 3600)/60);
    const remS = remainingSeconds % 60;
    const countdownStr = `${String(remH).padStart(2,'0')}:${String(remM).padStart(2,'0')}:${String(remS).padStart(2,'0')}`;

    // --- Dabartinis driving time (tik active) ---
    let drivingSeconds = elapsedSeconds;
    if(isPaused) {
        // sustabdome driving counter, bet dutyTime rodomas
        const pauseStart = new Date(state.activeShift.pause_time || now).getTime();
        drivingSeconds = Math.floor((pauseStart - start)/1000);
    }
    const drvH = Math.floor(drivingSeconds / 3600);
    const drvM = Math.floor((drivingSeconds % 3600)/60);
    const drvS = drivingSeconds % 60;
    const drivingStr = `${String(drvH).padStart(2,'0')}:${String(drvM).padStart(2,'0')}:${String(drvS).padStart(2,'0')}`;

    // --- HTML fragmentas ---
    el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:0.25rem;text-align:center;">
            <div class="val-lg">${pauseText}</div>
            <div class="val-timer">Dirbi: ${drivingStr} | Liko: ${countdownStr}</div>
            <div class="label-xs">Duty Time: ${dutyTimeStr}</div>
        </div>
    `;
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

    // --- Nauji tikslai (val. ir $) ---
    const targetTimeInput = document.getElementById('start-target-time');
    const targetMoneyInput = document.getElementById('start-target-money');
    targetTimeInput.value = '';
    targetMoneyInput.value = '';

    document.getElementById('start-modal').classList.remove('hidden');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    const targetTime = parseFloat(document.getElementById('start-target-time').value) || 0;
    const targetMoney = parseFloat(document.getElementById('start-target-money').value) || 0;

    if(!vid) return showToast('Pasirink mašiną', 'error');
    if(!odo) return showToast('Įvesk ridą', 'error');

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').insert({
            vehicle_id: vid,
            start_odo: parseInt(odo), 
            status: 'active',
            start_time: new Date().toISOString(),
            target_money: targetMoney,
            target_time: targetTime
        });

        if(error) throw error;

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
    const endOdoInput = document.getElementById('end-odo');
    if(state.activeShift && state.activeShift.start_odo) {
        endOdoInput.placeholder = `Min: ${state.activeShift.start_odo}`;
    }
    document.getElementById('end-modal').classList.remove('hidden'); 
}

export async function confirmEnd() {
    vibrate([20]);
    const odoInput = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;

    if(!odoInput) return showToast('Įvesk ridą', 'error');

    const endOdo = parseInt(odoInput);
    const startOdo = state.activeShift.start_odo;

    if(endOdo < startOdo) {
        return showToast(`Klaida! Rida negali būti mažesnė nei startinė (${startOdo})`, 'error');
    }

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

// --- PAUZĖ ---
export async function togglePause() {
    vibrate();
    if(!state.activeShift) return;

    const isPaused = state.activeShift.status === 'paused';
    const newStatus = isPaused ? 'active' : 'paused';

    state.activeShift.status = newStatus;
    if(newStatus === 'paused') {
        state.activeShift.pause_time = new Date().toISOString();
    }

    updateTimerDisplay();

    try {
        const { error } = await db.from('finance_shifts')
            .update({ status: newStatus, pause_time: state.activeShift.pause_time })
            .eq('id', state.activeShift.id);

        if(error) {
            state.activeShift.status = isPaused ? 'paused' : 'active';
            showToast('Nepavyko pakeisti statuso', 'error');
            window.dispatchEvent(new Event('refresh-data'));
        } else {
            showToast(isPaused ? 'Darbas tęsiamas ▶️' : 'Pertrauka ⏸️', 'info');
        }
    } catch(e) { console.error(e); }
}
