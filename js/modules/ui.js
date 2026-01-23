import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';
// SVARBU: IŠTRINTAS 'Shifts' importas

// --- THEME ENGINE ---
let currentTheme = localStorage.getItem('theme') || 'auto';

export function applyTheme() {
    const html = document.documentElement;
    const themeBtn = document.getElementById('btn-theme');
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    let isDark = false;
    if (currentTheme === 'dark') isDark = true;
    else if (currentTheme === 'light') isDark = false;
    else if (currentTheme === 'auto') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (isDark) {
        html.classList.add('dark');
        metaThemeColor?.setAttribute('content', '#000000');
    } else {
        html.classList.remove('dark');
        metaThemeColor?.setAttribute('content', '#f3f4f6');
    }

    if (themeBtn) {
        let iconClass = 'fa-circle-half-stroke';
        if (currentTheme === 'dark') iconClass = 'fa-moon';
        if (currentTheme === 'light') iconClass = 'fa-sun';
        themeBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    }
}

export function cycleTheme() {
    vibrate();
    if (currentTheme === 'auto') currentTheme = 'dark';
    else if (currentTheme === 'dark') currentTheme = 'light';
    else currentTheme = 'auto';
    localStorage.setItem('theme', currentTheme);
    applyTheme();
    showToast(`Theme: ${currentTheme.toUpperCase()}`, 'info');
}

// --- UI UPDATES ---
export function updateUI(key) {
    if (key === 'loading') {
        const el = document.getElementById('loading');
        if(el) el.classList.toggle('hidden', !state.loading);
    }
    
    if (key === 'activeShift') {
        const hasShift = !!state.activeShift;
        const btnStart = document.getElementById('btn-start');
        const activeControls = document.getElementById('active-controls');
        
        if(btnStart) btnStart.classList.toggle('hidden', hasShift);
        if(activeControls) activeControls.classList.toggle('hidden', !hasShift);
        
        // SVARBU: Mes tik pranešame app.js, kad būsena pasikeitė.
        // Mes patys nekviečiame Shifts.startTimer()
        const event = new CustomEvent('shiftStateChanged', { detail: hasShift });
        window.dispatchEvent(event);
    }
}

export function updateGrindBar() {
    const target = Math.round(state.dailyCost) || 1;
    const current = state.shiftEarnings || 0;
    
    const elVal = document.getElementById('grind-val');
    const elBar = document.getElementById('grind-bar');
    const elGlow = document.getElementById('grind-glow');

    if(elVal) elVal.textContent = `$${current} / $${target}`;
    
    const pct = Math.min((current / target) * 100, 100);
    if(elBar) elBar.style.width = `${pct}%`;
    if(elGlow) {
        if (pct >= 100) elGlow.classList.remove('hidden');
        else elGlow.classList.add('hidden');
    }
}

// --- MODALS & TABS ---
export function closeModals() {
    vibrate();
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
}

export function switchTab(id) {
    vibrate();
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const tab = document.getElementById(`tab-${id}`);
    if(tab) tab.classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById(`btn-${id}`);
    if(btn) btn.classList.add('active');
}
