import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';
import { refreshAll } from '../app.js'; // Reikia, kad atnaujintų viską po veiksmo

// --- TIMER LOGIC ---
let timerInt;

export function startTimer() {
    clearInterval(timerInt);
    const el = document.getElementById('shift-timer');
    if(!el) return;

    timerInt = setInterval(() => {
        if(!state.activeShift) return;
        
        const start = new Date(state.activeShift.start_time).getTime();
        const now = new Date().getTime();
        let diff = Math.floor((now - start) / 1000);
        
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        
        el.textContent = `${h}:${m}:${s}`;
    }, 1000);
}

export function stopTimer() {
    clearInterval(timerInt);
    const el = document.getElementById('shift-timer');
    if(el) el.textContent = "00:00:00";
}

// --- SHIFT ACTIONS ---
export function openStartModal() {
    vibrate();
    const sel = document.getElementById('start-vehicle');
    if(state.fleet.length === 0) {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    } else {
        sel.innerHTML = state.fleet.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
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
            status: 'active'
        });
        closeModals();
        await refreshAll();
        showToast('Pamaina pradėta', 'success');
        startTimer();
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
        stopTimer();
        await refreshAll();
        showToast('Pamaina baigta', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export function togglePause() {
    vibrate();
    if(!state.activeShift) return;
    showToast('Pause funkcija ruošiama', 'info'); 
}

