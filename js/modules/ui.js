// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI MODULE
// Versija: 1.3 (Architecture Fix: State-based Tabs)
// 
// ATSAKOMYBĖ: UI atvaizdavimas ir vartotojo sąsaja
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// THEME ENGINE
// ────────────────────────────────────────────────────────────────

let currentTheme = localStorage.getItem('theme') || 'auto';

export function applyTheme() {
    const html = document.documentElement;
    const themeBtn = document.getElementById('btn-theme');
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    let isDark = false;
    
    if (currentTheme === 'dark') {
        isDark = true;
    } else if (currentTheme === 'light') {
        isDark = false;
    } else if (currentTheme === 'auto') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

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

// ────────────────────────────────────────────────────────────────
// UI UPDATES (Reaguoja į state pasikeitimus)
// ────────────────────────────────────────────────────────────────

export function updateUI(key) {
    if (key === 'loading') {
        const el = document.getElementById('loading');
        if (el) el.classList.toggle('hidden', !state.loading);
    }
    
    if (key === 'activeShift') {
        updateShiftControls();
    }
}

// ────────────────────────────────────────────────────────────────
// SHIFT CONTROLS
// ────────────────────────────────────────────────────────────────

function updateShiftControls() {
    const hasShift = !!state.activeShift;
    const isPaused = state.activeShift?.status === 'paused';
    
    const btnStart = document.getElementById('btn-start');
    const activeControls = document.getElementById('active-controls');
    const btnPause = document.getElementById('btn-pause');
    
    // Čia vis dar naudojame hidden, nes tai elementų rodymas/slėpimas viduje, 
    // o ne tab'ų sistema. Tai netrukdo CSS architektūrai.
    if (btnStart) btnStart.classList.toggle('hidden', hasShift);
    if (activeControls) activeControls.classList.toggle('hidden', !hasShift);
    
    if (btnPause && hasShift) {
        if (isPaused) {
            btnPause.innerHTML = '<i class="fa-solid fa-play"></i>';
            btnPause.classList.remove('bg-yellow-500/10', 'text-yellow-500', 'border-yellow-500/50');
            btnPause.classList.add('bg-green-500/10', 'text-green-500', 'border-green-500/50');
        } else {
            btnPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            btnPause.classList.remove('bg-green-500/10', 'text-green-500', 'border-green-500/50');
            btnPause.classList.add('bg-yellow-500/10', 'text-yellow-500', 'border-yellow-500/50');
        }
    }
    
    const event = new CustomEvent('shiftStateChanged', { detail: hasShift });
    window.dispatchEvent(event);
}

// ────────────────────────────────────────────────────────────────
// PROGRESS BARS
// ────────────────────────────────────────────────────────────────

export function updateGrindBar() {}

export function renderProgressBar(elementId, current, target, colors = {}) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    
    el.style.width = `${percentage}%`;
    
    const glowEl = document.getElementById(elementId.replace('bar', 'glow'));
    if (glowEl) {
        // Čia irgi hidden yra OK, nes tai vidinis UI elementas
        glowEl.classList.toggle('hidden', percentage < 100);
    }
}

// ────────────────────────────────────────────────────────────────
// MODALS
// ────────────────────────────────────────────────────────────────

export function closeModals() {
    vibrate();
    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.classList.add('hidden');
    });
}

export function openModal(modalId) {
    vibrate();
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// ────────────────────────────────────────────────────────────────
// TABS (ARCHITECTURAL FIX APPLIED)
// ────────────────────────────────────────────────────────────────

export function switchTab(id) {
    vibrate();
    state.currentTab = id;
    
    // 1. Išjungiame visus tabus (nuimame .active)
    // DĖMESIO: Nebenaudojame .hidden klasės tab'ams
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    
    // 2. Aktyvuojame pasirinktą tabą
    // CSS .tab-content.active { display: block } atliks savo darbą
    const tab = document.getElementById(`tab-${id}`);
    if (tab) {
        tab.classList.add('active');
    }
    
    // 3. Atnaujiname navigacijos mygtukų stilių
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });
    
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.classList.add('active');
    
    // 4. Trigger data refresh jei reikia
    if (id === 'audit') {
        // Dabar, kai nebėra hidden konfliktų, DOM atsinaujina iškart,
        // todėl nereikia setTimeout hack'ų, bet refresh vis tiek iškviečiame.
        window.dispatchEvent(new Event('refresh-data'));
    }
    
    // Scroll to top pagerina UX
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ────────────────────────────────────────────────────────────────
// CLOCKS
// ────────────────────────────────────────────────────────────────

let clockInterval = null;

export function startClocks() {
    stopClocks();
    updateClocks();
    clockInterval = setInterval(updateClocks, 1000);
}

export function stopClocks() {
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
}

function updateClocks() {
    const settings = state.userSettings;
    if (!settings) return;
    
    try {
        const primaryTZ = settings.timezone_primary || 'America/Chicago';
        const secondaryTZ = settings.timezone_secondary || 'Europe/Vilnius';
        
        const primaryTime = new Date().toLocaleTimeString('en-US', {
            timeZone: primaryTZ, hour: '2-digit', minute: '2-digit', hour12: false
        });
        
        const secondaryTime = new Date().toLocaleTimeString('en-US', {
            timeZone: secondaryTZ, hour: '2-digit', minute: '2-digit', hour12: false
        });
        
        const primaryEl = document.getElementById('clock-primary');
        const secondaryEl = document.getElementById('clock-secondary');
        
        if (primaryEl) primaryEl.textContent = primaryTime;
        if (secondaryEl) secondaryEl.textContent = secondaryTime;
        
    } catch (error) {
        console.warn('Clock update failed:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// UTILS EXPORT
// ────────────────────────────────────────────────────────────────

export { showToast } from '../utils.js';

export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
