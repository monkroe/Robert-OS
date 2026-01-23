import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals, updateUI } from './ui.js';

let timerInt;

export function startTimer() {
    clearInterval(timerInt);
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
    
    const start = new Date(state.activeShift.start_time).getTime();
    const now = new Date().getTime();
    let diff = Math.floor((now - start) / 1000);
    
    const h = String(Math.floor(diff/3600)).padStart(2,'0');
    const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
    const s = String(diff%60).padStart(2,'0');
    const timeStr = `${h}:${m}:${s}`;

    if (state.activeShift.status === 'paused') {
        el.innerHTML = `<span class="opacity-40">${timeStr}</span> <span class="animate-pulse text-yellow-500 ml-2">⏸️</span>`;
        clearInterval(timerInt);
    } else {
        el.textContent = timeStr;
    }
}

export function openStartModal() {
    vibrate();
    const sel = document.getElementById('start-vehicle');
    sel.innerHTML = state.fleet.length ? state.fleet.map(v => `<option value="${v.id}">${v.name}</option>`).join('') : '<option>Garažas tuščias</option>';
    document.getElementById('start-modal').classList.remove('hidden');
}

export async function confirmStart() {
    vibrate(20);
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    if(!vid || !odo) return showToast('Įveskite pradinę ridą!', 'error');
    
    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').insert({
            vehicle_id: vid,
            start_odo: parseInt(odo),
            target_money: parseFloat(document.getElementById('start-money-target').value || 0),
            target_time: parseFloat(document.getElementById('start-time-target').value || 12),
            status: 'active',
            start_time: new Date().toISOString()
        });
        if(error) throw error;
        showToast('Pamaina pradėta! 🚀', 'success');
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export function openEndModal() { 
    vibrate();
    // GRĄŽINTAS RIDOS SUFLERIS
    const odoInput = document.getElementById('end-odo');
    if(state.activeShift && odoInput) {
        odoInput.placeholder = `Pradėta su: ${state.activeShift.start_odo}`;
        odoInput.value = ''; // Išvalom seną
    }
    document.getElementById('end-modal').classList.remove('hidden'); 
}

export async function confirmEnd() {
    vibrate(20);
    const odoEnd = parseInt(document.getElementById('end-odo').value);
    const appIncome = parseFloat(document.getElementById('end-earn').value || 0);
    
    if(!odoEnd) return showToast('Įveskite pabaigos ridą!', 'error');
    // SAUGIKLIS
    if(odoEnd < state.activeShift.start_odo) {
        return showToast(`Rida negali būti mažesnė nei ${state.activeShift.start_odo}!`, 'error');
    }

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: odoEnd,
            income_app: (state.activeShift.income_app || 0) + appIncome,
            weather: state.currentWeather,
            end_time: new Date().toISOString(),
            status: 'completed'
        }).eq('id', state.activeShift.id);
        
        if(error) throw error;
        showToast('Pamaina baigta 🏁', 'success');
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
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
        showToast(isPaused ? 'Dirbame toliau ▶️' : 'Pertrauka ⏸️', 'info');
        if (newStatus === 'active') startTimer();
        else updateTimerDisplay();
    } catch (e) { showToast('Klaida DB', 'error'); }
}
