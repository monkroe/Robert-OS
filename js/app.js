// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP JS v1.7.2 (FINAL)
// System Orchestrator - Delegates to Specialized Modules
// ════════════════════════════════════════════════════════════════

import { db, initSupabase } from './db.js';
import { state } from './state.js';
import { showToast } from './utils.js'; // Removed vibrate import if not used directly here

// ─── AUTH & UI MODULES ──────────────────────────────────────────
import { login, logout, checkSession } from './modules/auth.js';
import { switchTab, cycleTheme, applyTheme, openModal, closeModals, updateShiftControlsUI } from './modules/ui.js';

// ─── FEATURE MODULES ────────────────────────────────────────────
// Dabar šie importai veiks, nes pataisėme modulius:
import { initShiftsModals } from './modules/shifts.js';
import { initSettingsModal, loadSettings } from './modules/settings.js';
import { initGarageModals, loadFleet } from './modules/garage.js';
import { initFinanceModals, refreshAudit } from './modules/finance.js';
import { calculateDailyCost, calculateWeeklyRentalProgress, calculateShiftEarnings } from './modules/costs.js';

// ────────────────────────────────────────────────────────────────
// SYSTEM BOOT
// ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 ROBERT OS v1.7.2 - Booting...');
    
    // 1. Initialize DB Connection
    initSupabase();
    
    // 2. Inject Modals into DOM (Critical to avoid "Black Screen")
    try {
        initShiftsModals();
        initSettingsModal();
        initGarageModals();
        initFinanceModals();
    } catch (e) {
        console.error('❌ Modal Injection Failed:', e);
    }
    
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
    
    console.log('✅ ROBERT OS Ready');
});

// ────────────────────────────────────────────────────────────────
// AUTHENTICATION FLOW
// ────────────────────────────────────────────────────────────────

function showAuthScreen() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app-content');
    if (auth) auth.classList.remove('hidden');
    if (app) app.classList.add('hidden');
}

function showAppContent() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app-content');
    if (auth) auth.classList.add('hidden');
    if (app) app.classList.remove('hidden');
}

async function onUserLoggedIn() {
    showAppContent();
    
    // Load Critical Data in Parallel
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

// ────────────────────────────────────────────────────────────────
// DATA SYNC
// ────────────────────────────────────────────────────────────────

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

// Expose stop function for cleanup
window.stopTimer = () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
};

// ────────────────────────────────────────────────────────────────
// EVENT LISTENER SETUP
// ────────────────────────────────────────────────────────────────

function setupEventListeners() {
    // 1. Data refresh trigger
    window.addEventListener('refresh-data', async () => {
        await loadActiveShift(); 
        refreshUI();
        
        if (document.getElementById('tab-audit')?.classList.contains('active')) {
            refreshAudit();
        }
    });
    
    // 2. Audit refresh trigger
    window.addEventListener('refresh-audit', () => {
        refreshAudit();
    });

    // 3. User Login Trigger (IŠTAISYTA: Dabar sistema reaguos į login)
    window.addEventListener('user-logged-in', () => {
        console.log('🔄 Login event received, initializing app...');
        onUserLoggedIn();
    });

    // 4. Loading State Watcher
    setInterval(() => {
        const loader = document.getElementById('loading');
        if (loader) {
            if (state.loading) loader.classList.remove('hidden');
            else loader.classList.add('hidden');
        }
    }, 100);
    
    // 5. Close modals on overlay click
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModals();
        }
    });
    
    // 6. ESC key closes modals
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
window.openModal = openModal;
window.closeModals = closeModals;

// Debug
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.state = state;
    window.ROBERT_OS = { state, db, refreshUI, loadActiveShift };
}
