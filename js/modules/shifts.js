import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals, updateUI } from './ui.js';

let timerInt;

// --- LAIKMATIS (Su Countdown ir Duty Time) ---
export function startTimer() {
    clearInterval(timerInt);
    
    updateTimerDisplay(); // Iškart atnaujinam
    timerInt = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    clearInterval(timerInt);
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    const targetEl = document.getElementById('target-time-display');
    
    if(!state.activeShift) return;

    // 1. Skaičiuojame DUTY TIME (Nuo starto iki dabar, be jokių pauzių)
    const start = new Date(state.activeShift.start_time).getTime();
    const now = new Date().getTime();
    let dutySeconds = Math.floor((now - start) / 1000);
    
    // Formatuojame H:M:S
    const h = String(Math.floor(dutySeconds/3600)).padStart(2,'0');
    const m = String(Math.floor((dutySeconds%3600)/60)).padStart(2,'0');
    const s = String(dutySeconds%60).padStart(2,'0');

    // Jei pauzė - rodome "PAUSE", bet Duty Time vis tiek tiksi fone (tik vizualiai čia rodome statusą)
    if (state.activeShift.status === 'paused') {
        el.textContent = "PAUSED";
        el.classList.add('animate-pulse', 'text-yellow-500');
        el.classList.remove('text-white');
    } else {
        el.textContent = `${h}:${m}:${s}`;
        el.classList.remove('animate-pulse', 'text-yellow-500');
        el.classList.add('text-white');
    }

    // 2. Skaičiuojame LIKUSĮ LAIKĄ (Countdown), jei yra tikslas
    if (state.activeShift.target_time && targetEl) {
        const targetSeconds = state.activeShift.target_time * 3600;
        const leftSeconds = targetSeconds - dutySeconds;
        
        if (leftSeconds > 0) {
            const lh = String(Math.floor(leftSeconds/3600)).padStart(2,'0');
            const lm = String(Math.floor((leftSeconds%3600)/60)).padStart(2,'0');
            targetEl.textContent = `-${lh}:${lm}`;
            targetEl.classList.add('text-blue-400');
            targetEl.classList.remove('text-red-500');
        } else {
            // Viršvalandžiai
            targetEl.textContent = "DONE ✅";
            targetEl.classList.remove('text-blue-400');
            targetEl.classList.add('text-red-500', 'font-bold');
        }
    }
}


// --- MODALAI ---

// START MODAL (Su tikslais)
export function openStartModal() {
    vibrate();
    
    // Sugeneruojame HTML su tikslais
    const modalContent = `
        <h3 class="text-xl font-bold text-white mb-4">Pradėti Pamainą 🚀</h3>
        
        <label class="block text-xs text-gray-400 mb-1 ml-1">Automobilis</label>
        <select id="start-vehicle" class="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white mb-4 focus:border-teal-500 outline-none">
             ${state.fleet.length ? state.fleet.map(v => `<option value="${v.id}">${v.name}</option>`).join('') : '<option value="">Nėra mašinų</option>'}
        </select>

        <label class="block text-xs text-gray-400 mb-1 ml-1">Startinė Rida</label>
        <input type="number" id="start-odo" class="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white font-mono mb-6 focus:border-teal-500 outline-none" placeholder="000000">

        <div class="h-px bg-zinc-800 w-full mb-4"></div>
        <p class="text-xs text-gray-500 mb-3 uppercase font-bold">Dienos Tikslai (Neprivaloma)</p>

        <div class="grid grid-cols-2 gap-3 mb-6">
            <div>
                <label class="block text-xs text-gray-400 mb-1">Tikslas ($)</label>
                <input type="number" id="start-target-money" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white focus:border-teal-500 outline-none" placeholder="300">
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Tikslas (Val)</label>
                <input type="number" id="start-target-time" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white focus:border-teal-500 outline-none" placeholder="8">
            </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
            <button onclick="document.getElementById('start-modal').classList.add('hidden')" class="p-3 rounded-xl font-bold bg-zinc-800 text-gray-300">Atšaukti</button>
            <button onclick="window.confirmStart()" class="p-3 rounded-xl font-bold bg-teal-500 text-black">Startuoti</button>
        </div>
    `;
    
    const container = document.querySelector('#start-modal > div');
    if(container) container.innerHTML = modalContent;
    
    document.getElementById('start-modal').classList.remove('hidden');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    const tMoney = document.getElementById('start-target-money').value;
    const tTime = document.getElementById('start-target-time').value;
    
    if(!vid) return showToast('Pasirink mašiną', 'error');
    if(!odo) return showToast('Įvesk ridą', 'error');
    
    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').insert({
            vehicle_id: vid,
            start_odo: parseInt(odo), 
            target_money: tMoney ? parseFloat(tMoney) : 0,
            target_time: tTime ? parseFloat(tTime) : 0,
            status: 'active',
            start_time: new Date().toISOString()
        });

        if (error) throw error;

        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Gero darbo! 🚀', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}


// END MODAL (Su Orais)
export function openEndModal() { 
    vibrate();
    
    // Sugeneruojame HTML su Orais
    const modalContent = `
        <h3 class="text-xl font-bold text-white mb-4">Baigti Pamainą 🏁</h3>
        
        <label class="block text-xs text-gray-400 mb-1 ml-1">Galutinė Rida</label>
        <input type="number" id="end-odo" class="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white font-mono text-xl mb-6 focus:border-teal-500 outline-none" placeholder="Min: ${state.activeShift?.start_odo || 0}">

        <p class="text-xs text-gray-500 mb-3 uppercase font-bold">Vairavimo Sąlygos</p>
        <div class="grid grid-cols-5 gap-2 mb-6">
            <button type="button" onclick="window.selectWeather('sunny', this)" class="weather-btn p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-2xl hover:bg-zinc-800 transition">☀️</button>
            <button type="button" onclick="window.selectWeather('rain', this)" class="weather-btn p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-2xl hover:bg-zinc-800 transition">🌧️</button>
            <button type="button" onclick="window.selectWeather('snow', this)" class="weather-btn p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-2xl hover:bg-zinc-800 transition">❄️</button>
            <button type="button" onclick="window.selectWeather('ice', this)" class="weather-btn p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-2xl hover:bg-zinc-800 transition">🧊</button>
            <button type="button" onclick="window.selectWeather('fog', this)" class="weather-btn p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-2xl hover:bg-zinc-800 transition">🌫️</button>
        </div>
        <input type="hidden" id="selected-weather" value="sunny">

        <div class="grid grid-cols-2 gap-3">
            <button onclick="document.getElementById('end-modal').classList.add('hidden')" class="p-3 rounded-xl font-bold bg-zinc-800 text-gray-300">Atšaukti</button>
            <button onclick="window.confirmEnd()" class="p-3 rounded-xl font-bold bg-teal-500 text-black">Baigti</button>
        </div>
    `;

    const container = document.querySelector('#end-modal > div');
    if(container) container.innerHTML = modalContent;

    document.getElementById('end-modal').classList.remove('hidden'); 
}

// Pagalbinė orų funkcija (Globali)
window.selectWeather = (type, btn) => {
    vibrate();
    document.getElementById('selected-weather').value = type;
    document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('bg-teal-500', 'border-teal-500'));
    btn.classList.add('bg-teal-500', 'border-teal-500');
};

export async function confirmEnd() {
    vibrate([20]);
    const odoInput = document.getElementById('end-odo').value;
    const weather = document.getElementById('selected-weather').value;
    
    if(!odoInput) return showToast('Įvesk ridą', 'error');
    
    const endOdo = parseInt(odoInput);
    const startOdo = state.activeShift.start_odo;

    if (endOdo < startOdo) {
        return showToast(`Klaida! Rida mažesnė nei startinė (${startOdo})`, 'error');
    }

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: endOdo, 
            weather: weather, // Įrašome orus
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

    if (!isPaused) clearInterval(timerInt);
    else startTimer();

    await db.from('finance_shifts').update({ status: newStatus }).eq('id', state.activeShift.id);
}

// Globalios funkcijos (kad veiktų HTML'e)
window.openStartModal = openStartModal;
window.confirmStart = confirmStart;
window.openEndModal = openEndModal;
window.confirmEnd = confirmEnd;
window.handlePause = togglePause;
