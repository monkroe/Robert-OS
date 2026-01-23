import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

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

// --- WORLD CLOCKS (NAUJA v1.1.1) ---
export function updateDualClocks() {
    const chiEl = document.getElementById('clock-chi');
    const ltEl = document.getElementById('clock-lt');
    if (!chiEl || !ltEl) return;

    const now = new Date();
    
    // Čikagos laikas (CST)
    chiEl.textContent = now.toLocaleTimeString('en-GB', { 
        timeZone: 'America/Chicago', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    });
    
    // Lietuvos laikas (EET)
    ltEl.textContent = now.toLocaleTimeString('en-GB', { 
        timeZone: 'Europe/Vilnius', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    });
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
        
        const event = new CustomEvent('shiftStateChanged', { detail: hasShift });
        window.dispatchEvent(event);
    }
}

export function updateGrindBar() {
    // Išmanus kaštų skaičiavimas v1.1.1
    const monthlyFixed = 2500; 
    let vehicleCost = 0;
    
    if (state.activeShift) {
        const v = state.fleet.find(f => f.id === state.activeShift.vehicle_id);
        if (v) vehicleCost = v.operating_cost_weekly / 7;
    }

    // Tikslas paimamas arba iš įvesties, arba iš kaštų
    const target = state.targetMoney || (monthlyFixed / 30) + vehicleCost;
    const current = state.shiftEarnings || 0;
    
    const elVal = document.getElementById('grind-val');
    const elBar = document.getElementById('grind-bar');
    const elGlow = document.getElementById('grind-glow');

    if(elVal) elVal.textContent = `$${current} / $${Math.round(target)}`;
    
    const pct = Math.min((current / target) * 100, 100);
    if(elBar) {
        elBar.style.width = `${pct}%`;
        // Švelnesnė spalvų logika
        if (pct >= 100) {
            elBar.classList.remove('bg-red-500');
            elBar.classList.add('bg-green-500');
        } else {
            elBar.classList.add('bg-red-500');
            elBar.classList.remove('bg-green-500');
        }
    }

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
