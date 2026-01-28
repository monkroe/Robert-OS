// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v2.0.2
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
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        authScreen?.classList.add('hidden');
        appContent?.classList.remove('hidden');
        
        await Settings.loadSettings();
        await Garage.fetchFleet();
        await refreshAll();
        
        UI.startClocks();
    } else {
        authScreen?.classList.remove('hidden');
        appContent?.classList.add('hidden');
        UI.stopClocks();
    }
    
    window.addEventListener('refresh-data', refreshAll);
    
    // OS-grade theme synchronization
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
        
        if (state.activeShift) Shifts.startTimer();
        else Shifts.stopTimer();
        
        await updateProgressBars();
        
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
        const rentalProgress = await Costs.calculateWeeklyRentalProgress();
        UI.renderProgressBar('rental-bar', rentalProgress.earned, rentalProgress.target, {warning: 70, success: 90});
        UI.renderProgressText('rental-val', `$${rentalProgress.earned} / $${rentalProgress.target}`);
        
        const dailyCost = await Costs.calculateDailyCost();
        const shiftEarnings = Costs.calculateShiftEarnings();
        UI.renderProgressBar('grind-bar', shiftEarnings, dailyCost, {warning: 70, success: 90});
        UI.renderProgressText('grind-val', `$${Math.round(shiftEarnings)} / $${Math.round(dailyCost)}`);
        
        const earningsEl = document.getElementById('shift-earnings');
        if (earningsEl) earningsEl.textContent = `$${Math.round(shiftEarnings)}`;
    } catch (e) {
        console.error("Progress Analytics Sync Error:", e);
    }
}

// ────────────────────────────────────────────────────────────────
// WINDOW BINDINGS
// ────────────────────────────────────────────────────────────────

window.login = Auth.login;
window.logout = Auth.logout;
window.cycleTheme = UI.cycleTheme;
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;
window.closeModals = UI.closeModals;

window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
window.editVehicle = Garage.editVehicle;
window.deleteVehicle = Garage.deleteVehicle;
window.confirmDeleteVehicle = Garage.confirmDeleteVehicle;
window.cancelDeleteVehicle = Garage.cancelDeleteVehicle;
window.setVehType = Garage.setVehType;
window.toggleTestMode = Garage.toggleTestMode;

window.openStartModal = Shifts.openStartModal;
window.confirmStart = Shifts.confirmStart;
window.openEndModal = Shifts.openEndModal;
window.confirmEnd = Shifts.confirmEnd;
window.togglePause = Shifts.togglePause;
window.selectWeather = Shifts.selectWeather;

window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

document.addEventListener('DOMContentLoaded', init);
