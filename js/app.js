// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v2.1.0
// Logic: System Controller & Window Bindings
// ════════════════════════════════════════════════════════════════

import { db } from './db.js';
import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as Garage from './modules/garage.js';
import * as Shifts from './modules/shifts.js';
import * as Finance from './modules/finance.js';
import * as UI from './modules/ui.js';
import * as Settings from './modules/settings.js';
import * as Costs from './modules/costs.js';

// ────────────────────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────────────────────

async function init() {
    UI.applyTheme(); 
    
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');
    
    // Check for active session
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        authScreen?.classList.add('hidden');
        appContent?.classList.remove('hidden');
        
        // Critical Startup Sequence
        try {
            await Settings.loadSettings();
            await Garage.fetchFleet();
            await refreshAll();
            UI.startClocks();
        } catch (e) {
            console.error('Startup Sequence Failed:', e);
        }
    } else {
        authScreen?.classList.remove('hidden');
        appContent?.classList.add('hidden');
        UI.stopClocks();
    }
    
    // Global Event Listeners
    window.addEventListener('refresh-data', refreshAll);
    
    // OS-grade theme synchronization (Every 1 min)
    setInterval(() => UI.syncThemeIfAuto(), 60000);
}

// ────────────────────────────────────────────────────────────────
// REFRESH ENGINE (OS-Grade Security)
// ────────────────────────────────────────────────────────────────

export async function refreshAll() {
    // 🛡️ Guard Clause: Prevents crashes during session transitions
    if (!state.user) return;

    state.loading = true;
    UI.updateUI('loading');

    try {
        // 1. Get Active Shift Status
        const { data: shift } = await db
            .from('finance_shifts')
            .select('*')
            .in('status', ['active', 'paused'])
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        state.activeShift = shift;
        UI.updateUI('activeShift');
        
        // 2. Sync Timer Logic
        if (state.activeShift) Shifts.startTimer();
        else Shifts.stopTimer();
        
        // 3. Update Visual Analytics
        await updateProgressBars();
        
        // 4. Update Audit Log (if visible)
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            await Finance.refreshAudit();
        }
    } catch (error) {
        console.error('Refresh Engine Failure:', error);
    } finally {
        state.loading = false;
        UI.updateUI('loading');
    }
}

async function updateProgressBars() {
    if (!state.user) return;

    try {
        // Rental Progress
        const rentalProgress = await Costs.calculateWeeklyRentalProgress();
        UI.renderProgressBar('rental-bar', rentalProgress.earned, rentalProgress.target, {warning: 70, success: 90});
        UI.renderProgressText('rental-val', `$${rentalProgress.earned} / $${rentalProgress.target}`);
        
        // Daily Grind Progress
        const dailyCost = await Costs.calculateDailyCost();
        const shiftEarnings = Costs.calculateShiftEarnings();
        UI.renderProgressBar('grind-bar', shiftEarnings, dailyCost, {warning: 70, success: 90});
        UI.renderProgressText('grind-val', `$${Math.round(shiftEarnings)} / $${Math.round(dailyCost)}`);
        
        // Bento Card Earnings
        const earningsEl = document.getElementById('shift-earnings');
        if (earningsEl) earningsEl.textContent = `$${Math.round(shiftEarnings)}`;
    } catch (e) {
        console.error("Progress Analytics Sync Error:", e);
    }
}

// ────────────────────────────────────────────────────────────────
// WINDOW BINDINGS (The Bridge between HTML and Modules)
// ────────────────────────────────────────────────────────────────

// AUTH
window.login = Auth.login;
window.logout = Auth.logout;

// UI & NAVIGATION
window.cycleTheme = UI.cycleTheme;
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;
window.closeModals = UI.closeModals;
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

// GARAGE / FLEET
window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
window.editVehicle = Garage.editVehicle;
window.deleteVehicle = Garage.deleteVehicle;
window.confirmDeleteVehicle = Garage.confirmDeleteVehicle;
window.cancelDeleteVehicle = Garage.cancelDeleteVehicle;
window.setVehType = Garage.setVehType;
window.toggleTestMode = Garage.toggleTestMode;

// SHIFTS
window.openStartModal = Shifts.openStartModal;
window.confirmStart = Shifts.confirmStart;
window.openEndModal = Shifts.openEndModal;
window.confirmEnd = Shifts.confirmEnd;
window.togglePause = Shifts.togglePause;
window.selectWeather = Shifts.selectWeather;

// FINANCE & TRANSACTIONS (✅ Added Fix)
window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;

// AUDIT & LOGS (✅ Added Fix)
window.toggleSelectAll = Finance.toggleSelectAll;
window.requestLogDelete = Finance.requestLogDelete;
window.confirmLogDelete = Finance.confirmLogDelete;
window.exportAI = Finance.exportAI;

// ────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
