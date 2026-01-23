// ui.js - Robert OS v1.1
import { state } from '../state.js';
import { startTimer, stopTimer, togglePause, confirmStart, confirmEnd, openStartModal, openEndModal } from './shifts.js';
import { showToast } from '../utils.js';

let clockInterval;

// --- INIT CLOCKS (CST + LT) ---
export function initClocks() {
    const cstEl = document.getElementById('clock-cst');
    const ltEl = document.getElementById('clock-lt');

    if (!cstEl || !ltEl) return;

    updateClocks(); // pirma update iškart
    clockInterval = setInterval(updateClocks, 1000);

    function updateClocks() {
        const now = new Date();

        // Čikagos laikas CST (UTC-6)
        const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const cstStr = cstTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        cstEl.textContent = `CST: ${cstStr}`;

        // Lietuvos laikas EET / LT (UTC+2)
        const ltTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vilnius' }));
        const ltStr = ltTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        ltEl.textContent = `LT: ${ltStr}`;
    }
}

// --- MODAL CONTROL ---
export function closeModals() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(m => m.classList.add('hidden'));
}

export function updateUI(section) {
    if(section === 'activeShift') {
        const pauseBtn = document.getElementById('btn-pause');
        if(!pauseBtn || !state.activeShift) return;
        pauseBtn.textContent = state.activeShift.status === 'paused' ? 'Resume ▶️' : 'Pause ⏸️';
    }
}

// --- START SHIFT MODAL ---
export function renderStartModal() {
    const modal = document.getElementById('start-modal');
    if(!modal) return;

    modal.innerHTML = `
    <div class="modal-content animate-slideUp">
        <h2 class="val-lg">Pradėti pamainą</h2>
        <div class="bento-grid">
            <div>
                <label class="label-xs">Pasirink mašiną</label>
                <select id="start-vehicle" class="input-field"></select>
            </div>
            <div>
                <label class="label-xs">Pradinė rida</label>
                <input type="number" id="start-odo" class="input-field" placeholder="pvz. 12000">
            </div>
        </div>
        <div class="bento-grid" style="margin-top:0.75rem;">
            <div>
                <label class="label-xs">Tikslas (Val)</label>
                <input type="number" id="start-target-time" class="input-field" placeholder="pvz. 8">
            </div>
            <div>
                <label class="label-xs">Tikslas ($)</label>
                <input type="number" id="start-target-money" class="input-field" placeholder="pvz. 300">
            </div>
        </div>
        <div style="margin-top:1rem;">
            <button class="btn-primary-os" onclick="confirmStart()">Pradėti</button>
        </div>
    </div>
    `;
}

// --- END SHIFT MODAL ---
export function renderEndModal() {
    const modal = document.getElementById('end-modal');
    if(!modal) return;

    modal.innerHTML = `
    <div class="modal-content animate-slideUp">
        <h2 class="val-lg">Baigti pamainą</h2>
        <div class="bento-grid">
            <div>
                <label class="label-xs">Galutinė rida</label>
                <input type="number" id="end-odo" class="input-field" placeholder="">
            </div>
            <div>
                <label class="label-xs">Uždirbta ($)</label>
                <input type="number" id="end-earn" class="input-field" placeholder="pvz. 120">
            </div>
        </div>
        <div style="margin-top:0.75rem;">
            <label class="label-xs">Orai / sąlygos</label>
            <select id="end-weather" class="input-field">
                <option value="">Pasirink</option>
                <option value="sunny">Saulėta</option>
                <option value="rain">Lietus</option>
                <option value="snow">Sniegas</option>
                <option value="ice">Ledo kelias</option>
                <option value="fog">Rūkas</option>
            </select>
        </div>
        <div style="margin-top:1rem;">
            <button class="btn-primary-os" onclick="confirmEnd()">Baigti pamainą</button>
        </div>
    </div>
    `;
}

// --- INIT ALL MODALS ---
export function initModals() {
    renderStartModal();
    renderEndModal();

    // close overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if(e.target === modal) closeModals();
        });
    });
}

// --- INIT BUTTONS ---
export function initButtons() {
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');
    const pauseBtn = document.getElementById('btn-pause');

    if(startBtn) startBtn.addEventListener('click', openStartModal);
    if(stopBtn) stopBtn.addEventListener('click', stopTimer);
    if(pauseBtn) pauseBtn.addEventListener('click', togglePause);
}

// --- INIT ALL UI ---
export function initUI() {
    initClocks();
    initModals();
    initButtons();
}
