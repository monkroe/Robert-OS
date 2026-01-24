// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI MODULE v1.7 “PRO UI” (STABLE)
// Versija: 1.7
// Patobulinimai: Smooth animations, Glow effects, Tab fade/slide, Real-time clocks
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// THEME ENGINE 2.0
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

    // Toggle class
    if (isDark) html.classList.add('dark');
    else html.classList.remove('dark');

    // Meta update
    metaThemeColor?.setAttribute('content', isDark ? '#000000' : '#f3f4f6');
    
    // Smooth transition enforcement
    html.style.transition = 'background-color 0.5s ease, color 0.3s ease';

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

// ────────────────────────────────────────────────────────────────
// SHIFT CONTROLS WITH ANIMATIONS
// ────────────────────────────────────────────────────────────────

function updateShiftControls() {
    const hasShift = !!state.activeShift;
    const isPaused = state.activeShift?.status === 'paused';
    
    const btnStart = document.getElementById('btn-start');
    const activeControls = document.getElementById('active-controls');
    const btnPause = document.getElementById('btn-pause');

    // Hidden naudojame elementų rodymui/slėpimui
    if (btnStart) btnStart.classList.toggle('hidden', hasShift);
    if (activeControls) activeControls.classList.toggle('hidden', !hasShift);

    if (btnPause && hasShift) {
        // Reset classes
        btnPause.className = 'col-span-1 btn-bento transition-all duration-300';
        
        if (isPaused) {
            btnPause.innerHTML = '<i class="fa-solid fa-play"></i>';
            btnPause.classList.add('bg-green-500/10', 'text-green-500', 'border-green-500/50', 'pulse-animation');
        } else {
            btnPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            btnPause.classList.add('bg-yellow-500/10', 'text-yellow-500', 'border-yellow-500/50');
            // Remove pulse when running normally (optional) or keep it
        }
    }

    window.dispatchEvent(new CustomEvent('shiftStateChanged', { detail: hasShift }));
}

// ────────────────────────────────────────────────────────────────
// PROGRESS BARS WITH SMOOTH ANIMATION
// ────────────────────────────────────────────────────────────────

// SVARBU: Paliekame šią funkciją dėl suderinamumo su app.js
export function updateGrindBar() {}

export function renderProgressBar(elementId, current, target, colors = {}) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    
    // JS transition control
    el.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.width = `${percentage}%`;

    const glowEl = document.getElementById(elementId.replace('bar', 'glow'));
    if (glowEl) {
        glowEl.classList.toggle('hidden', percentage < 100);
    }
}

// ────────────────────────────────────────────────────────────────
// MODALS WITH FADE & SCALE
// ────────────────────────────────────────────────────────────────

export function closeModals() {
    vibrate();
    document.querySelectorAll('.modal-overlay').forEach(el => {
        if (!el.classList.contains('hidden')) {
            el.classList.add('fade-out');
            el.classList.remove('fade-in');
            
            // Palaukiame kol animacija baigsis prieš paslepiant
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

// ────────────────────────────────────────────────────────────────
// TABS WITH FADE/SLIDE TRANSITION
// ────────────────────────────────────────────────────────────────

export function switchTab(id) {
    vibrate();
    state.currentTab = id;

    // 1. Reset Tabs
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active', 'fade-in');
    });

    // 2. Activate Tab with Animation
    const tab = document.getElementById(`tab-${id}`);
    if (tab) {
        tab.classList.add('active', 'fade-in');
    }

    // 3. Update Nav
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.classList.add('active');

    // 4. Data Refresh
    if (id === 'audit') {
        window.dispatchEvent(new Event('refresh-data'));
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ────────────────────────────────────────────────────────────────
// CLOCKS WITH SMOOTH UPDATES
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
export function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
