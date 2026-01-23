import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

let currentTheme = localStorage.getItem('theme') || 'auto';

export function applyTheme() {
    const html = document.documentElement;
    const isDark = currentTheme === 'dark' || (currentTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    html.classList.toggle('dark', isDark);
}

export function cycleTheme() {
    vibrate();
    currentTheme = currentTheme === 'auto' ? 'dark' : currentTheme === 'dark' ? 'light' : 'auto';
    localStorage.setItem('theme', currentTheme);
    applyTheme();
    showToast(`Theme: ${currentTheme.toUpperCase()}`, 'info');
}

export function updateDualClocks() {
    const c = document.getElementById('clock-chi');
    const l = document.getElementById('clock-lt');
    if (!c || !l) return;
    const n = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
    c.textContent = n.toLocaleTimeString('en-GB', { ...opts, timeZone: 'America/Chicago' });
    l.textContent = n.toLocaleTimeString('en-GB', { ...opts, timeZone: 'Europe/Vilnius' });
}

export function updateUI(key) {
    if (key === 'loading') document.getElementById('loading')?.classList.toggle('hidden', !state.loading);
    if (key === 'activeShift') {
        const hasS = !!state.activeShift;
        document.getElementById('btn-start')?.classList.toggle('hidden', hasS);
        document.getElementById('active-controls')?.classList.toggle('hidden', !hasS);
        window.dispatchEvent(new CustomEvent('shiftStateChanged', { detail: hasS }));
    }
}

export function updateGrindBar() {
    const target = state.targetMoney || 350; 
    const current = state.shiftEarnings || 0;
    const elV = document.getElementById('grind-val');
    const elB = document.getElementById('grind-bar');
    if(elV) elV.textContent = `$${Math.round(current)} / $${Math.round(target)}`;
    const pct = Math.min((current / target) * 100, 100);
    if(elB) {
        elB.style.width = `${pct}%`;
        elB.className = `h-full transition-all duration-500 ${pct >= 100 ? 'bg-green-500' : 'bg-teal-500'}`;
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
