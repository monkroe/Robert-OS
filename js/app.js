// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v2.6.0
// Logic: System Core, UI Bindings & Status Updates
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
    // 1. Pataisome UI tekstus (Hotfix be HTML keitimo)
    const startBtn = document.querySelector('#start-modal .btn-primary-os');
    if (startBtn) startBtn.innerHTML = 'START SHIFT';

    // 2. Auth Check
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
            console.error('System Start Error:', e);
        }
    } else {
        authScreen?.classList.remove('hidden');
        appContent?.classList.add('hidden');
        UI.stopClocks();
    }
    
    // Global Event Listeners
    window.addEventListener('refresh-data', refreshAll);
    
    // Auto-Theme (kas 1 min)
    setInterval(() => UI.syncThemeIfAuto(), 60000);
    UI.applyTheme();
}

// ────────────────────────────────────────────────────────────────
// REFRESH ENGINE (UI UPDATES)
// ────────────────────────────────────────────────────────────────

export async function refreshAll() {
    if (!state.user) return;

    state.loading = true;
    const loadingEl = document.getElementById('loading');
    // Rodyti loading tik pirma karta arba ilgoms operacijoms
    // loadingEl?.classList.remove('hidden'); 

    try {
        // 1. Fetch Active Shift
        const { data: shift } = await db
            .from('finance_shifts')
            .select('*')
            .in('status', ['active', 'paused'])
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        state.activeShift = shift;
        
        // 2. Update Timer & Status
        if (state.activeShift) {
            Shifts.startTimer();
            updateActiveStatus(true);
        } else {
            Shifts.stopTimer();
            updateActiveStatus(false);
        }
        
        UI.updateUI('activeShift');
        
        // 3. Update Progress Bars
        await updateProgressBars();
        
        // 4. Update Logs (jei tabas atidarytas)
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            await Finance.refreshAudit();
        }

    } catch (error) {
        console.error('Refresh Failed:', error);
    } finally {
        state.loading = false;
        loadingEl?.classList.add('hidden');
    }
}

function updateActiveStatus(isActive) {
    const statusLabel = document.querySelector('.label-xs.relative.z-10');
    const timer = document.getElementById('shift-timer');
    
    if (!statusLabel) return;

    if (isActive) {
        // Pulsating Badge
        statusLabel.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="active-pulse"></div>
                <span class="text-teal-500 font-bold tracking-widest">ACTIVE SESSION</span>
            </div>
        `;
        timer.classList.remove('opacity-50');
    } else {
        // Idle State
        statusLabel.innerHTML = `<span class="opacity-50 tracking-widest">READY TO START</span>`;
        timer.classList.add('opacity-50');
        timer.textContent = "00:00:00";
    }
}

async function updateProgressBars() {
    if (!state.user) return;

    try {
        // Rental Coverage
        const rentalProgress = await Costs.calculateWeeklyRentalProgress();
        UI.renderProgressBar('rental-bar', rentalProgress.earned, rentalProgress.target, {warning: 80, success: 100});
        UI.renderProgressText('rental-val', `$${Math.round(rentalProgress.earned)} / $${rentalProgress.target}`);
        
        // Daily Grind
        const dailyCost = await Costs.calculateDailyCost();
        const shiftEarnings = Costs.calculateShiftEarnings();
        UI.renderProgressBar('grind-bar', shiftEarnings, dailyCost, {warning: 80, success: 100});
        UI.renderProgressText('grind-val', `$${Math.round(shiftEarnings)} / $${Math.round(dailyCost)}`);
        
        // Mini Card
        const earningsEl = document.getElementById('shift-earnings');
        if (earningsEl) earningsEl.textContent = `$${Math.round(shiftEarnings)}`;
        
    } catch (e) {
        console.error("Analytics Error:", e);
    }
}

// ────────────────────────────────────────────────────────────────
// WINDOW BINDINGS (Sujungimas su HTML)
// ────────────────────────────────────────────────────────────────

// AUTH
window.login = Auth.login;
window.logout = Auth.logout;

// UI
window.cycleTheme = UI.cycleTheme;
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;
window.closeModals = UI.closeModals;
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

// GARAGE
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

// FINANCE
window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;

// LOGS & ACTIONS
window.toggleSelectAll = Finance.toggleSelectAll;
window.requestLogDelete = Finance.requestLogDelete;
window.confirmLogDelete = Finance.confirmLogDelete;
window.exportAI = Finance.exportAI;
window.updateDeleteButtonLocal = Finance.updateDeleteButtonLocal;
window.openShiftDetails = Finance.openShiftDetails;
window.deleteShift = Finance.deleteShift; // Button logic

// Paleidimas
document.addEventListener('DOMContentLoaded', init);
