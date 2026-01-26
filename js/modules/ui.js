// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI MODULE
// Versija: 1.2
// 
// ATSAKOMYBĖ: UI atvaizdavimas ir vartotojo sąsaja
// Temos, modalai, tab'ai, progress bars (tik rendering, ne logika)
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
    
    // Pause mygtuko tekstas
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
}

// ────────────────────────────────────────────────────────────────
// PROGRESS BARS (Tik vizualizacija, skaičiavimus daro Costs)
// ────────────────────────────────────────────────────────────────

export function updateGrindBar() {
    // Legacy funkcija - dabar app.js valdo progress bars
    // Paliekame tuščią suderinamumui
}

// ────────────────────────────────────────────────────────────────
// PROGRESS BAR HELPERS (Naudojami iš app.js)
// ────────────────────────────────────────────────────────────────

export function renderProgressBar(elementId, current, target, colors = {}) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    
    // Nustatyti plotį
    el.style.width = `${percentage}%`;
    
    // Nustatyti spalvą
    el.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-500');
    
    if (percentage < (colors.warning || 70)) {
        el.classList.add('bg-red-500');
    } else if (percentage < (colors.success || 90)) {
        el.classList.add('bg-yellow-500');
    } else {
        el.classList.add('bg-green-500');
    }
    
    // Glow effect jei 100%
    const glowEl = el.querySelector('.glow');
    if (glowEl) {
        glowEl.classList.toggle('hidden', percentage < 100);
    }
}

export function renderProgressText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
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
// TABS (Navigacija tarp Cockpit/Audit/Runway/Vault/Future)
// ────────────────────────────────────────────────────────────────

export function switchTab(id) {
    vibrate();
    
    // Atnaujinti state
    state.currentTab = id;
    
    // Slėpti visus tabs
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Rodyti pasirinktą
    const tab = document.getElementById(`tab-${id}`);
    if (tab) {
        tab.classList.remove('hidden');
    }
    
    // Atnaujinti navigation mygtukus
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });
    
    const btn = document.getElementById(`btn-${id}`);
    if (btn) {
        btn.classList.add('active');
    }
    
    // Jei perjungiame į Audit - atnaujinti istoriją
    if (id === 'audit') {
        window.dispatchEvent(new Event('refresh-data'));
    }
}

// ────────────────────────────────────────────────────────────────
// LAIKRODŽIAI (CST/LT)
// ────────────────────────────────────────────────────────────────

let clockInterval = null;

export function startClocks() {
    stopClocks(); // Išvalyti seną interval
    
    updateClocks(); // Pirmas update iškart
    clockInterval = setInterval(updateClocks, 1000); // Kas sekundę
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
            timeZone: primaryTZ,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        const secondaryTime = new Date().toLocaleTimeString('en-US', {
            timeZone: secondaryTZ,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        // Atnaujinti DOM (jei elementai egzistuoja)
        const primaryEl = document.getElementById('clock-primary');
        const secondaryEl = document.getElementById('clock-secondary');
        
        if (primaryEl) primaryEl.textContent = primaryTime;
        if (secondaryEl) secondaryEl.textContent = secondaryTime; // ✅ PATAISYTA
        
    } catch (error) {
        // Timezone klaida - ignoruojame
        console.warn('Clock update failed:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS (Wrapper)
// ────────────────────────────────────────────────────────────────

export { showToast } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// ANIMATIONS (Scroll, Fade, etc.)
// ────────────────────────────────────────────────────────────────

export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function fadeIn(element, duration = 300) {
    if (!element) return;
    
    element.style.opacity = '0';
    element.style.display = 'block';
    
    let start = null;
    
    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const opacity = Math.min(progress / duration, 1);
        
        element.style.opacity = opacity;
        
        if (progress < duration) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
}

export function fadeOut(element, duration = 300) {
    if (!element) return;
    
    let start = null;
    const initialOpacity = parseFloat(element.style.opacity) || 1;
    
    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const opacity = Math.max(initialOpacity - (progress / duration), 0);
        
        element.style.opacity = opacity;
        
        if (progress < duration) {
            requestAnimationFrame(animate);
        } else {
            element.style.display = 'none';
        }
    }
    
    requestAnimationFrame(animate);
}

// ────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ────────────────────────────────────────────────────────────────

export function formatCurrency(amount, decimals = 0) {
    return `$${Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals)}`;
}

export function formatTime(seconds) {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

export function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}
