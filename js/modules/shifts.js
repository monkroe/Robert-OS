import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals, updateUI } from './ui.js';

let timerInt;

export function startTimer() {
    clearInterval(timerInt);
    if (state.activeShift?.status === 'paused') {
        const el = document.getElementById('shift-timer');
        if(el) el.textContent = "PAUSE";
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
    const targetMoney = document.getElementById('start-money-target').value;
    const targetTime = document.getElementById('start-time-target').value;
    
    if(!vid || !odo) return showToast('Užpildyk duomenis', 'error');
    
    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').insert({
            vehicle_id: vid,
            start_odo: parseInt(odo), 
            status: 'active',
            target_money: parseFloat(targetMoney || 0),
            target_time: parseFloat(targetTime || 12),
            start_time: new Date().toISOString()
        });
        if (error) throw error;
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Sėkmės kelyje! 🚀', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export function openEndModal() { 
    vibrate();
    document.getElementById('end-modal').classList.remove('hidden'); 
}

export async function confirmEnd() {
    vibrate([20]);
    const odoEnd = parseInt(document.getElementById('end-odo').value);
    const appIncome = parseFloat(document.getElementById('end-earn').value || 0);
    
    if(!odoEnd) return showToast('Įvesk ridą', 'error');

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: odoEnd, 
            income_app: appIncome,
            weather: state.currentWeather,
            end_time: new Date().toISOString(), 
            status: 'completed'
        }).eq('id', state.activeShift.id);
        
        if(error) throw error;
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina baigta 🏁', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function togglePause() {
    vibrate();
    if (!state.activeShift) return;
    const isPaused = state.activeShift.status === 'paused';
    const newStatus = isPaused ? 'active' : 'paused';
    state.activeShift.status = newStatus;
    updateUI('activeShift');
    try {
        await db.from('finance_shifts').update({ status: newStatus }).eq('id', state.activeShift.id);
        if (newStatus === 'active') startTimer();
    } catch (e) { console.error(e); }
}
