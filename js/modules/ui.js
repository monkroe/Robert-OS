// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI MODULE v1.7.2 (FIXED)
// Theme Management, Modals, Tabs, Animations
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// THEME SYSTEM (Auto/Dark/Light)
// ────────────────────────────────────────────────────────────────

let currentTheme = localStorage.getItem('theme') || 'dark';

export function cycleTheme() {
    vibrate();
    
    // Cycle: dark → light → auto → dark
    if (currentTheme === 'dark') currentTheme = 'light';
    else if (currentTheme === 'light') currentTheme = 'auto';
    else currentTheme = 'dark';
    
    localStorage.setItem('theme', currentTheme);
    applyTheme();
    
    let label = currentTheme === 'auto' ? 'AUTO' : (currentTheme === 'dark' ? 'DARK' : 'LIGHT');
    showToast(`Theme: ${label}`, 'info');
}

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
    
    if (isDark) html.classList.add('dark');
    else html.classList.remove('dark');
    
    // Update PWA status bar color
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#000000' : '#f3f4f6');
    }
    
    // Update theme button icon
    if (themeBtn) {
        let iconClass = 'fa-circle-half-stroke'; // auto
        if (currentTheme === 'dark') iconClass = 'fa-moon';
        if (currentTheme === 'light') iconClass = 'fa-sun';
        themeBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    }
}

// ────────────────────────────────────────────────────────────────
// MODAL MANAGEMENT (with Fade Animations)
// ────────────────────────────────────────────────────────────────

export function openModal(modalId) {
    vibrate();
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('hidden', 'fade-out');
    modal.classList.add('fade-in');
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

export function closeModals() {
    vibrate();
    
    document.querySelectorAll('.modal-overlay').forEach(el => {
        if (!el.classList.contains('hidden')) {
            // Add fade-out animation
            el.classList.add('fade-out');
            el.classList.remove('fade-in');
            
            // Remove after animation completes
            setTimeout(() => {
                el.classList.add('hidden');
                el.classList.remove('fade-out');
            }, 200);
        }
    });
    
    // Restore body scroll
    setTimeout(() => {
        document.body.style.overflow = '';
    }, 200);
}

// ────────────────────────────────────────────────────────────────
// TAB NAVIGATION
// ────────────────────────────────────────────────────────────────

export function switchTab(tabName) {
    vibrate();
    
    // Update state
    state.currentTab = tabName;
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.remove('active', 'fade-in');
    });
    
    // Remove active from all nav items
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
    });
    
    // Show selected tab with fade
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.add('active', 'fade-in');
    }
    
    // Activate nav button
    const targetBtn = document.getElementById(`btn-${tabName}`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }
    
    // Special actions per tab
    if (tabName === 'audit') {
        window.dispatchEvent(new Event('refresh-audit'));
    }
    
    // Smooth scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ────────────────────────────────────────────────────────────────
// UI STATE UPDATES
// ────────────────────────────────────────────────────────────────

export function updateShiftControlsUI() {
    const startBtn = document.getElementById('btn-start');
    const activeControls = document.getElementById('active-controls');
    const timerEl = document.getElementById('shift-timer');
    const pauseBtnIcon = document.querySelector('#btn-pause i');
    
    if (state.activeShift) {
        // Shift Active
        if (startBtn) startBtn.classList.add('hidden');
        if (activeControls) activeControls.classList.remove('hidden');
        
        // Pause State UI
        if (state.activeShift.paused_at) { // Checks if paused_at timestamp exists
            timerEl?.classList.add('pulse-text');
            if (pauseBtnIcon) {
                pauseBtnIcon.classList.remove('fa-pause');
                pauseBtnIcon.classList.add('fa-play');
            }
        } else {
            timerEl?.classList.remove('pulse-text');
            if (pauseBtnIcon) {
                pauseBtnIcon.classList.remove('fa-play');
                pauseBtnIcon.classList.add('fa-pause');
            }
        }
    } else {
        // No Active Shift
        if (startBtn) startBtn.classList.remove('hidden');
        if (activeControls) activeControls.classList.add('hidden');
        if (timerEl) {
            timerEl.textContent = '00:00:00';
            timerEl.classList.remove('pulse-text');
        }
    }
}

// ────────────────────────────────────────────────────────────────
// WINDOW EXPORTS (Svarbu HTML mygtukams)
// ────────────────────────────────────────────────────────────────

window.cycleTheme = cycleTheme;
window.applyTheme = applyTheme;
window.openModal = openModal;
window.closeModals = closeModals;
window.switchTab = switchTab;
