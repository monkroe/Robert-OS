import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';
// SVARBU: IŠTRINTAS 'refreshAll' importas, kad nebūtų klaidų

let timerInt;

export function startTimer() {
    clearInterval(timerInt);
    const el = document.getElementById('shift-timer');
    if(!el) return;

    // Iškart atnaujinam, nelaukdami 1 sek.
    updateTimerDisplay();

    timerInt = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if(!state.activeShift || !el) return;
    
    const start = new Date(state.activeShift.start_time).getTime();
    const now = new Date().getTime();
    let diff = Math.floor((now - start) / 1000);
    
    // Apsauga nuo neigiamo laiko (jei laikrodis nesinchronizuotas)
    if (diff < 0) diff = 0;
    
    const h = String(Math.floor(diff/3600)).padStart(2,'0');
    const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
    const s = String(diff%60).padStart(2,'0');
    
    el.textContent = `${h}:${m}:${s}`;
}

export function stopTimer() {
    clearInterval(timerInt);
    const el = document.getElementById('shift-timer');
    if(el) el.textContent = "00:00:00";
}

export function openStartModal() {
    vibrate();
    const sel = document.getElementById('start-vehicle');
    if(state.fleet.length === 0) {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    } else {
        sel.innerHTML = state.fleet.map(v => `<option value="${v.id}">${v.name}${v.is_test ? ' (TEST)' : ''}</option>`).join('');
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
        await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: parseInt(odo), 
            status: 'active',
            start_time: new Date().toISOString() // Užtikrinam, kad laikas tikslus
        });
        closeModals();
        
        // SVARBU: Siunčiame signalą į app.js
        window.dispatchEvent(new Event('refresh-data'));
        
        showToast('Pamaina pradėta', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export function openEndModal() { 
    vibrate();
    document.getElementById('end-modal').classList.remove('hidden'); 
}

export async function confirmEnd() {
    vibrate([20]);
    const odo = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    
    if(!odo) return showToast('Įvesk ridą ir pajamas', 'error');
    
    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: parseInt(odo), 
            gross_earnings: parseFloat(earn || 0),
            end_time: new Date().toISOString(), 
            status: 'completed'
        }).eq('id', state.activeShift.id);
        
        if(error) throw error;
        
        closeModals();
        
        // SVARBU: Siunčiame signalą
        window.dispatchEvent(new Event('refresh-data'));
        
        showToast('Pamaina baigta', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export function togglePause() {
    vibrate();
    showToast('Pause funkcija ruošiama', 'info'); 
}
