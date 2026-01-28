// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI MODULE v2.0.2
// ════════════════════════════════════════════════════════════════
import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// THEME ENGINE (Telefono sistemos sinchronizacija)
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
    
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#000000' : '#f3f4f6');
    }
    
    if (themeBtn) {
        const icons = {
            auto: 'fa-circle-half-stroke',
            dark: 'fa-moon',
            light: 'fa-sun'
        };
        // Saugiklis: Jei theme reikšmė neteisinga, grįžtama prie 'auto' ikonos
        themeBtn.innerHTML = `<i class="fa-solid ${icons[theme] || icons.auto}"></i>`;
    }
}

export function cycleTheme() {
    vibrate();
    const modes = ['auto', 'dark', 'light'];
    let current = localStorage.getItem('theme') || 'auto';
    let next = modes[(modes.indexOf(current) + 1) % modes.length];
    
    localStorage.setItem('theme', next);
    applyTheme();
    showToast(`TEMA: ${next.toUpperCase()}`, 'info');
}

// OS-level sinchronizacija: app.js kviečia šią funkciją per setInterval
export function syncThemeIfAuto() {
    if ((localStorage.getItem('theme') || 'auto') === 'auto') {
        applyTheme();
    }
}

// Klausomės operacinės sistemos pakeitimų realiu laiku
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    syncThemeIfAuto();
});

// ────────────────────────────────────────────────────────────────
// UI UPDATES (Active Shift & Loading)
// ────────────────────────────────────────────────────────────────

export function updateUI(key) {
    if (key === 'loading') {
        document.getElementById('loading')?.classList.toggle('hidden', !state.loading);
    }
    
    if (key === 'activeShift') {
        const hasShift = !!state.activeShift;
        const isPaused = state.activeShift?.status === 'paused';
        
        document.getElementById('btn-start')?.classList.toggle('hidden', hasShift);
        document.getElementById('active-controls')?.classList.toggle('hidden', !hasShift);
        
        const btnPause = document.getElementById('btn-pause');
        if (btnPause && hasShift) {
            btnPause.innerHTML = isPaused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
            btnPause.className = isPaused 
                ? 'col-span-1 btn-bento bg-green-500/10 text-green-500 border-green-500/50' 
                : 'col-span-1 btn-bento bg-yellow-500/10 text-yellow-500 border-yellow-500/50';
        }
    }
}

// ────────────────────────────────────────────────────────────────
// LAIKRODŽIAI
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
    const settings = state.userSettings;
    if (!settings) return;
    try {
        const primaryTime = new Date().toLocaleTimeString('en-US', {
            timeZone: settings.timezone_primary || 'America/Chicago',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const secondaryTime = new Date().toLocaleTimeString('en-US', {
            timeZone: settings.timezone_secondary || 'Europe/Vilnius',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const pEl = document.getElementById('clock-primary');
        const sEl = document.getElementById('clock-secondary');
        if (pEl) pEl.textContent = primaryTime;
        if (sEl) sEl.textContent = secondaryTime;
    } catch (e) {}
}

// ────────────────────────────────────────────────────────────────
// MODALS, TABS, PROGRESS
// ────────────────────────────────────────────────────────────────

export function openModal(id) { vibrate(); document.getElementById(id)?.classList.remove('hidden'); }
export function closeModals() { vibrate(); document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden')); }

export function switchTab(id) {
    vibrate();
    document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.add('hidden');
        t.classList.remove('active');
    });
    const activeTab = document.getElementById(`tab-${id}`);
    if (activeTab) {
        activeTab.classList.remove('hidden');
        requestAnimationFrame(() => activeTab.classList.add('active'));
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`btn-${id}`)?.classList.add('active');
    if (id === 'audit') window.dispatchEvent(new Event('refresh-data'));
}

export function renderProgressBar(id, cur, tar, colors = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    const per = tar > 0 ? Math.min((cur / tar) * 100, 100) : 0;
    el.style.width = `${per}%`;
    el.className = `h-full transition-all duration-500 relative ${per < (colors.warning || 70) ? 'bg-red-500' : per < (colors.success || 90) ? 'bg-yellow-500' : 'bg-green-500'}`;
}

export function renderProgressText(id, txt) { 
    const el = document.getElementById(id); 
    if (el) el.textContent = txt; 
}
