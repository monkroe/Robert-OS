import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

let currentTheme = localStorage.getItem('theme') || 'auto';

export function applyTheme() {
    const html = document.documentElement;
    const themeBtn = document.getElementById('btn-theme');
    let isDark = currentTheme === 'dark' || (currentTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    html.classList.toggle('dark', isDark);
    if (themeBtn) themeBtn.innerHTML = `<i class="fa-solid fa-${currentTheme === 'dark' ? 'moon' : currentTheme === 'light' ? 'sun' : 'circle-half-stroke'}"></i>`;
}

export function cycleTheme() {
    vibrate();
    currentTheme = currentTheme === 'auto' ? 'dark' : currentTheme === 'dark' ? 'light' : 'auto';
    localStorage.setItem('theme', currentTheme);
    applyTheme();
}

export function updateDualClocks() {
    const chiEl = document.getElementById('clock-chi');
    const ltEl = document.getElementById('clock-lt');
    if (!chiEl || !ltEl) return;

    const options = { hour: '2-digit', minute: '2-digit', hour12: false };
    chiEl.textContent = new Date().toLocaleTimeString('en-GB', { ...options, timeZone: 'America/Chicago' });
    ltEl.textContent = new Date().toLocaleTimeString('en-GB', { ...options, timeZone: 'Europe/Vilnius' });
}

export function updateUI(key) {
    if (key === 'activeShift') {
        const hasShift = !!state.activeShift;
        document.getElementById('btn-start')?.classList.toggle('hidden', hasShift);
        document.getElementById('active-controls')?.classList.toggle('hidden', !hasShift);
        window.dispatchEvent(new CustomEvent('shiftStateChanged', { detail: hasShift }));
    }
}

export function updateGrindBar() {
    const monthlyFixed = 2500; 
    let vehicleCost = 0;
    if (state.activeShift) {
        const v = state.fleet.find(f => f.id === state.activeShift.vehicle_id);
        if (v) vehicleCost = v.operating_cost_weekly / 7;
    }
    const target = state.targetMoney || (monthlyFixed / 30) + vehicleCost;
    const current = state.shiftEarnings || 0;
    const elVal = document.getElementById('grind-val');
    const elBar = document.getElementById('grind-bar');

    if(elVal) elVal.textContent = `$${Math.round(current)} / $${Math.round(target)}`;
    const pct = Math.min((current / target) * 100, 100);
    if(elBar) {
        elBar.style.width = `${pct}%`;
        elBar.className = `h-full transition-all duration-500 ${pct >= 100 ? 'bg-green-500' : 'bg-red-500'}`;
    }
}

export function closeModals() {
    vibrate();
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
}

export function switchTab(id) {
    vibrate();
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${id}`)?.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`btn-${id}`)?.classList.add('active');
}
