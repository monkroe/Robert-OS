// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/UI.JS v2.1.2
// Logic: Themes, Clocks, Navigation & Reactive UI
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// THEME ENGINE
// ────────────────────────────────────────────────────────────────

export function applyTheme() {
    const html = document.documentElement;
    const themeBtn = document.getElementById('btn-theme');
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    const theme = localStorage.getItem('theme') || 'auto';
    let isDark = false;

    if (theme === 'auto') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
        isDark = (theme === 'dark');
    }

    html.classList.toggle('light', !isDark);
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#000000' : '#f3f4f6');
    }
    
    if (themeBtn) {
        const icons = { auto: 'fa-circle-half-stroke', dark: 'fa-moon', light: 'fa-sun' };
        themeBtn.innerHTML = `<i class="fa-solid ${icons[theme] || icons.auto}"></i>`;
    }
}

export function cycleTheme() {
    vibrate([10]);
    const modes = ['auto', 'dark', 'light'];
    let current = localStorage.getItem('theme') || 'auto';
    let next = modes[(modes.indexOf(current) + 1) % modes.length];
    
    localStorage.setItem('theme', next);
    applyTheme();
    showToast(`TEMA: ${next.toUpperCase()}`, 'info');
}

export function syncThemeIfAuto() {
    if ((localStorage.getItem('theme') || 'auto') === 'auto') {
        applyTheme();
    }
}

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => syncThemeIfAuto());
}

// ────────────────────────────────────────────────────────────────
// UI UPDATES
// ────────────────────────────────────────────────────────────────

export function updateUI(key) {
    if (key === 'loading') {
        const loader = document.getElementById('loading');
        if (loader) loader.classList.toggle('hidden', !state.loading);
    }
    
    if (key === 'activeShift') {
        const hasShift = !!state.activeShift;
        const isPaused = state.activeShift?.status === 'paused';
        
        document.getElementById('btn-start')?.classList.toggle('hidden', hasShift);
        document.getElementById('active-controls')?.classList.toggle('hidden', !hasShift);
        
        const btnPause = document.getElementById('btn-pause');
        if (btnPause && hasShift) {
            if (isPaused) {
                btnPause.innerHTML = '<i class="fa-solid fa-play"></i>';
                btnPause.className = 'col-span-1 btn-bento bg-green-500/10 text-green-500 border-green-500/50 hover:bg-green-500/20';
            } else {
                btnPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
                btnPause.className = 'col-span-1 btn-bento bg-yellow-500/10 text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/20';
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────
// CLOCK ENGINE (FIXED)
// ────────────────────────────────────────────────────────────────

let clockInterval = null;

export function startClocks() {
    stopClocks();
    updateClocks();
    clockInterval = setInterval(updateClocks, 1000);
}

export function stopClocks() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = null;
}

function updateClocks() {
    const settings = state.userSettings || { timezone: 'America/Chicago' };

    try {
        const primaryTime = new Date().toLocaleTimeString('lt-LT', {
            timeZone: settings.timezone || 'America/Chicago',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        
        // FIX: Default to Chicago if missing
        const secondaryTime = new Date().toLocaleTimeString('lt-LT', {
            timeZone: settings.timezone_secondary || 'America/Chicago',
            hour: '2-digit', minute: '2-digit', hour12: false
        });

        const pEl = document.getElementById('clock-primary');
        const sEl = document.getElementById('clock-secondary');
        
        if (pEl) pEl.textContent = primaryTime;
        if (sEl) sEl.textContent = `LOCAL: ${secondaryTime}`;
        
    } catch (e) {
        console.warn('Clock Error:', e);
    }
}

// ────────────────────────────────────────────────────────────────
// NAVIGATION & MODALS
// ────────────────────────────────────────────────────────────────

export function openModal(id) { 
    vibrate([10]); 
    const el = document.getElementById(id);
    if(el) { el.classList.remove('hidden'); el.classList.add('flex'); }
}

export function closeModals() { 
    vibrate([10]); 
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.classList.add('hidden'); m.classList.remove('flex');
    }); 
}

export function switchTab(id) {
    vibrate([5]);
    document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.add('hidden'); t.classList.remove('active', 'animate-slideUp');
    });
    
    const activeTab = document.getElementById(`tab-${id}`);
    if (activeTab) {
        activeTab.classList.remove('hidden');
        requestAnimationFrame(() => activeTab.classList.add('animate-slideUp'));
    }
    
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active', 'text-teal-500'); n.classList.add('opacity-50');
    });
    
    const activeBtn = document.getElementById(`btn-${id}`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'text-teal-500'); activeBtn.classList.remove('opacity-50');
    }

    state.currentTab = id;
    if (id === 'audit') window.dispatchEvent(new Event('refresh-data'));
}

export function renderProgressBar(id, cur, tar, colors = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const percent = tar > 0 ? Math.min((cur / tar) * 100, 100) : 0;
    el.style.width = `${percent}%`;
    el.className = 'h-full transition-all duration-500 relative';
    
    if (percent < (colors.warning || 70)) el.classList.add('bg-red-500');
    else if (percent < (colors.success || 90)) el.classList.add('bg-teal-500');
    else el.classList.add('bg-green-500');
}

export function renderProgressText(id, txt) { 
    const el = document.getElementById(id); 
    if (el) el.textContent = txt; 
}
