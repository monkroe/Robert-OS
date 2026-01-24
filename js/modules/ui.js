// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI MODULE
// Versija: 1.2
// 
// ATSAKOMYBĖ: UI atvaizdavimas ir vartotojo sąsaja
// Temos, modalai, tab'ai, progress bars, laikrodžiai
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// THEME ENGINE (Original + Fixed)
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
// SHIFT CONTROLS (Start/Pause/End mygtukai)
// ────────────────────────────────────────────────────────────────

function updateShiftControls() {
    const hasShift = !!state.activeShift;
    const isPaused = state.activeShift?.status === 'paused';
    
    const btnStart = document.getElementById('btn-start');
    const activeControls = document.getElementById('active-controls');
    const btnPause = document.getElementById('btn-pause');
    
    // Rodyti/slėpti mygtukus
    if (btnStart) btnStart.classList.toggle('hidden', hasShift);
    if (activeControls) activeControls.classList.toggle('hidden', !hasShift);
    
    // Pause mygtuko tekstas ir spalva
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
    
    // Pranešti apie būsenos pasikeitimą (suderinamumas su sena sistema)
    const event = new CustomEvent('shiftStateChanged', { detail: hasShift });
    window.dispatchEvent(event);
}

// ────────────────────────────────────────────────────────────────
// PROGRESS BARS (Suderinamumas su App.js ir Costs)
// ────────────────────────────────────────────────────────────────

// Legacy funkcija (paliekame tuščią, nes app.js valdo bars)
export function updateGrindBar() {}

// Helperis iš app.js
export function renderProgressBar(elementId, current, target, colors = {}) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    
    el.style.width = `${percentage}%`;
    
    // Glow effect (jei 100%)
    const glowEl = document.getElementById(elementId.replace('bar', 'glow'));
    if (glowEl) {
        glowEl.classList.toggle('hidden', percentage < 100);
    }
}

// ────────────────────────────────────────────────────────────────
// MODALS (Atidarymas/Uždarymas)
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
// TABS (Navigacija)
// ────────────────────────────────────────────────────────────────

export function switchTab(id) {
    vibrate();
    
    state.currentTab = id;
    
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    const tab = document.getElementById(`tab-${id}`);
    if (tab) tab.classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.classList.add('active');
    
    // Jei Audit tab - atnaujinti istoriją
    if (id === 'audit') {
        window.dispatchEvent(new Event('refresh-data'));
    }
}

// ────────────────────────────────────────────────────────────────
// LAIKRODŽIAI (Laiko zonos)
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
// UTILS
// ────────────────────────────────────────────────────────────────

export { showToast } from '../utils.js';

export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
