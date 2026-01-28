// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v2.6.1 (SIMPLE & STABLE)
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

async function init() {
    // 1. UI TEXT FIX (Hardcoded override)
    const startBtn = document.querySelector('#start-modal .btn-primary-os');
    if (startBtn) startBtn.textContent = 'START SHIFT';

    // 2. Auth & Startup
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');
    
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        authScreen?.classList.add('hidden');
        appContent?.classList.remove('hidden');
        
        try {
            await Settings.loadSettings();
            await Garage.fetchFleet();
            await refreshAll();
            UI.startClocks();
        } catch (e) {
            console.error('Boot Error:', e);
        }
    } else {
        authScreen?.classList.remove('hidden');
        appContent?.classList.add('hidden');
        UI.stopClocks();
    }
    
    window.addEventListener('refresh-data', refreshAll);
    UI.applyTheme();
}

export async function refreshAll() {
    if (!state.user) return;

    try {
        // Fetch Active Shift
        const { data: shift } = await db
            .from('finance_shifts')
            .select('*')
            .in('status', ['active', 'paused'])
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        state.activeShift = shift;
        
        // Timer Logic
        const timerEl = document.getElementById('shift-timer');
        if (state.activeShift) {
            Shifts.startTimer();
            // Tik pridedam klasę, nekeičiam HTML
            timerEl?.classList.remove('opacity-50');
            timerEl?.classList.add('pulse-text'); // Pulsavimas
        } else {
            Shifts.stopTimer();
            timerEl?.classList.add('opacity-50');
            timerEl?.classList.remove('pulse-text');
        }
        
        UI.updateUI('activeShift');
        
        // Progress Bars
        await updateProgressBars();
        
        // Logs
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            await Finance.refreshAudit();
        }

    } catch (error) {
        console.error('Refresh Error:', error);
    }
}

async function updateProgressBars() {
    if (!state.user) return;
    try {
        const rentalProgress = await Costs.calculateWeeklyRentalProgress();
        UI.renderProgressBar('rental-bar', rentalProgress.earned, rentalProgress.target);
        UI.renderProgressText('rental-val', `$${Math.round(rentalProgress.earned)} / $${rentalProgress.target}`);
        
        const dailyCost = await Costs.calculateDailyCost();
        const shiftEarnings = Costs.calculateShiftEarnings();
        UI.renderProgressBar('grind-bar', shiftEarnings, dailyCost);
        UI.renderProgressText('grind-val', `$${Math.round(shiftEarnings)} / $${Math.round(dailyCost)}`);
        
        const earningsEl = document.getElementById('shift-earnings');
        if (earningsEl) earningsEl.textContent = `$${Math.round(shiftEarnings)}`;
    } catch (e) { console.error(e); }
}

// WINDOW BINDINGS
window.login = Auth.login;
window.logout = Auth.logout;
window.cycleTheme = UI.cycleTheme;
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;
window.closeModals = UI.closeModals;
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;
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
window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;
window.toggleSelectAll = Finance.toggleSelectAll;
window.requestLogDelete = Finance.requestLogDelete;
window.confirmLogDelete = Finance.confirmLogDelete;
window.exportAI = Finance.exportAI;
window.updateDeleteButtonLocal = Finance.updateDeleteButtonLocal;
window.openShiftDetails = Finance.openShiftDetails; // Modal open

document.addEventListener('DOMContentLoaded', init);
