// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v1.7.0 (ORCHESTRATOR)
// System Orchestrator & UI Bridge
// ════════════════════════════════════════════════════════════════

import { db, initSupabase } from './db.js';
import { state } from './state.js';
import { showToast, vibrate } from './utils.js';

// ─── MODULE IMPORTS ─────────────────────────────────────────────
import { initShiftsModals } from './modules/shifts.js';
import { initSettingsModal, loadSettings } from './modules/settings.js';
import { initGarageModals, loadFleet } from './modules/garage.js';
import { initFinanceModals, refreshAudit } from './modules/finance.js';
import { calculateDailyCost, calculateWeeklyRentalProgress, calculateShiftEarnings } from './modules/costs.js';

// ────────────────────────────────────────────────────────────────
// SYSTEM BOOT
// ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 ROBERT OS v1.7.1 - Booting...');
    
    // 1. Initialize DB Connection
    initSupabase();
    
    // 2. Inject Modals into DOM
    initShiftsModals();
    initSettingsModal();
    initGarageModals();
    initFinanceModals();
    
    // 3. Auth Check
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        console.log(`👤 User authenticated: ${state.user.email}`);
        await onUserLoggedIn();
    } else {
        showAuthScreen();
    }
    
    // 4. Setup Global Listeners
    setupEventListeners();
    
    console.log('✅ ROBERT OS Ready & Listening');
});

// ────────────────────────────────────────────────────────────────
// AUTHENTICATION FLOW
// ────────────────────────────────────────────────────────────────

function showAuthScreen() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-content').classList.add('hidden');
}

function showAppContent() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-content').classList.remove('hidden');
}

async function login() {
    vibrate();
    
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value;
    
    if (!email || !password) {
        return showToast('Įvesk email ir slaptažodį', 'error');
    }
    
    state.loading = true;
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        
        if (error) throw error;
        
        state.user = data.user;
        showToast('Sveiki sugrįžę! 👋', 'success');
        await onUserLoggedIn();
        
    } catch (error) {
        console.error('Login error:', error);
        showToast('Prisijungimo klaida. Bandykite dar kartą.', 'error');
    } finally {
        state.loading = false;
    }
}

async function logout() {
    vibrate();
    
    try {
        await db.auth.signOut();
        state.user = null;
        state.userSettings = null;
        state.fleet = [];
        state.activeShift = null;
        
        showAuthScreen();
        showToast('Atsijungta sėkmingai', 'info');
        
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// DATA SYNC & ORCHESTRATION
// ────────────────────────────────────────────────────────────────

async function onUserLoggedIn() {
    showAppContent();
    
    // Load Critical Data
    await Promise.all([
        loadSettings(),
        loadFleet(),
        loadActiveShift()
    ]);
    
    // Apply Visual Preferences
    applyTheme();
    
    // Start Loops
    startTimerUpdate();
    refreshUI();
    
    // Initial Audit Refresh if needed
    if (document.getElementById('tab-audit')?.classList.contains('active')) {
        refreshAudit();
    }
}

async function loadActiveShift() {
    try {
        const { data, error } = await db
            .from('finance_shifts')
            .select('*')
            .eq('user_id', state.user.id)
            .eq('status', 'active')
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        state.activeShift = data;
        updateShiftControlsUI();
        
    } catch (error) {
        console.error('Active shift load error:', error);
    }
}

function updateShiftControlsUI() {
    const startBtn = document.getElementById('btn-start');
    const activeControls = document.getElementById('active-controls');
    const timerEl = document.getElementById('shift-timer');
    const pauseBtnIcon = document.querySelector('#btn-pause i');
    
    if (state.activeShift) {
        // Shift Active
        if (startBtn) startBtn.classList.add('hidden');
        if (activeControls) activeControls.classList.remove('hidden');
        
        // Pause State
        if (state.activeShift.paused_at) {
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
// UI REFRESH LOGIC
// ────────────────────────────────────────────────────────────────

async function refreshUI() {
    updateShiftControlsUI();

    try {
        const dailyCost = await calculateDailyCost();
        const rentalProgress = await calculateWeeklyRentalProgress();
        const shiftEarnings = calculateShiftEarnings();
        
        // Update Grind Bar
        const grindVal = document.getElementById('grind-val');
        const grindBar = document.getElementById('grind-bar');
        const grindGlow = document.getElementById('grind-glow');
        
        if (grindVal && grindBar) {
            const target = dailyCost > 0 ? dailyCost : 1;
            const percent = Math.min((shiftEarnings / target) * 100, 100);
            
            grindVal.textContent = `$${shiftEarnings} / $${dailyCost}`;
            grindBar.style.width = `${percent}%`;
            
            if (percent >= 100 && grindGlow) grindGlow.classList.remove('hidden');
            else if (grindGlow) grindGlow.classList.add('hidden');
        }
        
        // Update Rental Bar
        const rentalVal = document.getElementById('rental-val');
        const rentalBar = document.getElementById('rental-bar');
        
        if (rentalVal && rentalBar) {
            rentalVal.textContent = `$${rentalProgress.earned} / $${rentalProgress.target}`;
            rentalBar.style.width = `${rentalProgress.percentage}%`;
            
            rentalBar.className = `h-full transition-all duration-500 relative ${
                rentalProgress.percentage >= 100 ? 'bg-green-500' : 
                rentalProgress.percentage >= 75 ? 'bg-yellow-500' : 'bg-teal-500'
            }`;
        }
        
        // Update Earnings Display
        const earningsEl = document.getElementById('shift-earnings');
        if (earningsEl) {
            earningsEl.textContent = `$${shiftEarnings}`;
        }
        
    } catch (error) {
        console.error('UI Refresh Error:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// TIMER SYSTEM
// ────────────────────────────────────────────────────────────────

let timerInterval = null;

function startTimerUpdate() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
}

function updateTimer() {
    const timerEl = document.getElementById('shift-timer');
    if (!timerEl || !state.activeShift) return;
    
    if (state.activeShift.paused_at) return;
    
    const startTime = new Date(state.activeShift.start_time);
    const now = new Date();
    
    let diff = Math.floor((now - startTime) / 1000);
    
    if (state.activeShift.total_paused_seconds) {
        diff -= state.activeShift.total_paused_seconds;
    }
    
    if (diff < 0) diff = 0;
    
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    
    timerEl.textContent = `${h}:${m}:${s}`;
}

// ────────────────────────────────────────────────────────────────
// NAVIGATION & THEME
// ────────────────────────────────────────────────────────────────

function switchTab(tabName) {
    vibrate();
    
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetBtn = document.getElementById(`btn-${tabName}`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');
    
    if (tabName === 'audit') refreshAudit();
}

function cycleTheme() {
    vibrate();
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    
    if (isDark) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
}

function applyTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
}

// ────────────────────────────────────────────────────────────────
// EVENT LISTENER SETUP
// ────────────────────────────────────────────────────────────────

function setupEventListeners() {
    window.addEventListener('refresh-data', async () => {
        await loadActiveShift(); 
        refreshUI();
        
        // ✅ CORRECTED: Check for ACTIVE class instead of hidden
        if (document.getElementById('tab-audit')?.classList.contains('active')) {
            refreshAudit();
        }
    });

    // Loading State Watcher
    setInterval(() => {
        const loader = document.getElementById('loading');
        if (loader) {
            if (state.loading) loader.classList.remove('hidden');
            else loader.classList.add('hidden');
        }
    }, 100);
    
    // Close modals on overlay click
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModals();
        }
    });
    
    // ESC key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModals();
        }
    });
}

// ────────────────────────────────────────────────────────────────
// GLOBAL EXPORTS
// ────────────────────────────────────────────────────────────────

window.login = login;
window.logout = logout;
window.switchTab = switchTab;
window.cycleTheme = cycleTheme;
window.openModal = (id) => {
    const el = document.getElementById(id);
    if(el) {
        el.classList.remove('hidden');
        el.classList.add('fade-in');
    }
};
window.closeModals = () => {
    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('fade-in');
    });
};

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.state = state;
}
