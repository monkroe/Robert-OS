// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI MODULE v1.7.0
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// THEME
// ────────────────────────────────────────────────────────────────

let currentTheme = localStorage.getItem('theme') || 'auto';

export function applyTheme() {
    const html = document.documentElement;
    const themeBtn = document.getElementById('btn-theme');
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    let isDark = false;
    
    if (currentTheme === 'dark') isDark = true;
    else if (currentTheme === 'light') isDark = false;
    else if (currentTheme === 'auto') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (isDark) html.classList.add('dark');
    else html.classList.remove('dark');

    if (metaThemeColor) metaThemeColor.setAttribute('content', isDark ? '#000000' : '#f3f4f6');

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
// UI UPDATES
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

function updateShiftControls() {
    const hasShift = !!state.activeShift;
    const isPaused = state.activeShift?.status === 'paused';
    
    const btnStart = document.getElementById('btn-start');
    const activeControls = document.getElementById('active-controls');
    const btnPause = document.getElementById('btn-pause');

    if (btnStart) btnStart.classList.toggle('hidden', hasShift);
    if (activeControls) activeControls.classList.toggle('hidden', !hasShift);

    if (btnPause && hasShift) {
        if (isPaused) {
            btnPause.innerHTML = '<i class="fa-solid fa-play"></i>';
            btnPause.className = 'col-span-1 btn-bento bg-green-500/10 text-green-500 border-green-500/50 transition-all';
        } else {
            btnPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            btnPause.className = 'col-span-1 btn-bento bg-yellow-500/10 text-yellow-500 border-yellow-500/50 transition-all';
        }
    }
}

// ────────────────────────────────────────────────────────────────
// MODALS & TABS
// ────────────────────────────────────────────────────────────────

export function closeModals() {
    vibrate();
    document.querySelectorAll('.modal-overlay').forEach(el => {
        if (!el.classList.contains('hidden')) {
            el.classList.add('fade-out');
            setTimeout(() => {
                el.classList.add('hidden');
                el.classList.remove('fade-out');
            }, 200);
        }
    });
}

export function openModal(modalId) {
    vibrate();
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden', 'fade-out');
        modal.classList.add('fade-in');
    }
}

export function switchTab(id) {
    vibrate();
    state.currentTab = id;

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active', 'fade-in'));
    const tab = document.getElementById(`tab-${id}`);
    if (tab) tab.classList.add('active', 'fade-in');

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.classList.add('active');

    if (id === 'audit') {
        window.dispatchEvent(new Event('refresh-data'));
    }
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
    const settings = state.userSettings || {};
    
    try {
        // Gali būti undefined arba "" (disabled)
        const primaryTZ = settings.timezone_primary;   
        const secondaryTZ = settings.timezone_secondary; 

        const elPrimary = document.getElementById('clock-primary');
        const elSecondary = document.getElementById('clock-secondary');

        // 1. PRIMARY CLOCK
        if (elPrimary) {
            if (!primaryTZ) {
                elPrimary.textContent = ""; 
                elPrimary.classList.add('hidden'); 
            } else {
                elPrimary.classList.remove('hidden');
                elPrimary.textContent = new Date().toLocaleTimeString('en-US', { 
                    timeZone: primaryTZ, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: false 
                });
            }
        }

        // 2. SECONDARY CLOCK
        if (elSecondary) {
            if (!secondaryTZ) {
                elSecondary.textContent = "";
                elSecondary.classList.add('hidden');
            } else {
                elSecondary.classList.remove('hidden');
                elSecondary.textContent = new Date().toLocaleTimeString('en-US', { 
                    timeZone: secondaryTZ, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: false 
                });
            }
        }

    } catch (error) {
        console.warn('Clock update logic error (likely invalid timezone):', error);
    }
}
