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
    if(!vid || !odo) return showToast('Įveskite duomenis!', 'error');
    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').insert({
            vehicle_id: vid, start_odo: parseInt(odo), status: 'active',
            target_money: parseFloat(document.getElementById('start-money-target').value || 0),
            target_time: parseFloat(document.getElementById('start-time-target').value || 12),
            start_time: new Date().toISOString()
        });
        if(error) throw error;
        showToast('🚀 Pamaina pradėta!', 'success');
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export function openEndModal() { 
    vibrate();
    const odoInput = document.getElementById('end-odo');
    if(state.activeShift) odoInput.placeholder = `Min: ${state.activeShift.start_odo} mi`;
    document.getElementById('end-modal').classList.remove('hidden'); 
}

export async function confirmEnd() {
    vibrate(20);
    const odoEnd = parseInt(document.getElementById('end-odo').value);
    const appIncome = parseFloat(document.getElementById('end-earn').value || 0);
    if(!odoEnd) return showToast('Įveskite pabaigos ridą!', 'error');
    if(odoEnd < state.activeShift.start_odo) return showToast(`Klaida! Rida < ${state.activeShift.start_odo}`, 'error');

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: odoEnd, income_app: (state.activeShift.income_app || 0) + appIncome,
            weather: state.currentWeather, end_time: new Date().toISOString(), status: 'completed'
        }).eq('id', state.activeShift.id);
        if(error) throw error;
        showToast('🏁 Pamaina baigta!', 'success');
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function togglePause() {
    vibrate();
    if (!state.activeShift) return;
    const isP = state.activeShift.status === 'paused';
    const newS = isP ? 'active' : 'paused';
    state.activeShift.status = newS;
    updateUI('activeShift');
    try {
        await db.from('finance_shifts').update({ status: newS }).eq('id', state.activeShift.id);
        showToast(isP ? '▶️ Darbas tęsiamas' : '⏸️ Pertrauka', 'info');
        if (newS === 'active') startTimer();
        else updateTimerDisplay();
    } catch (e) { showToast('Klaida DB', 'error'); }
}

export function setWeather(w, btn) {
    vibrate();
    state.currentWeather = w;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500'));
    btn.classList.add('bg-teal-500', 'text-black', 'border-teal-500');
}
