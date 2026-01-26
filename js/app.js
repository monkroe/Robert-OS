// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v1.8.2
// ════════════════════════════════════════════════════════════════

import { db } from './db.js';
import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as Garage from './modules/garage.js';
import * as Shifts from './modules/shifts.js';
import * as Finance from './modules/finance.js'; // Svarbu importuoti
import * as UI from './modules/ui.js';
import * as Settings from './modules/settings.js';
import * as Costs from './modules/costs.js';

// 1. TEMOS VALDYMAS
function initTheme() {
    const root = document.documentElement;
    const saved = localStorage.getItem('theme');
    const hour = new Date().getHours();

    if (saved === 'dark') {
        root.classList.remove('light');
    } else if (saved === 'light') {
        root.classList.add('light');
    } else {
        if (hour >= 7 && hour < 19) root.classList.add('light');
        else root.classList.remove('light');
    }
}

// 2. SISTEMOS INICIALIZAVIMAS
async function init() {
    initTheme();
    
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');

    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        if(authScreen) authScreen.classList.add('hidden');
        if(appContent) appContent.classList.remove('hidden');
        
        try {
            await Settings.loadSettings();
        } catch (error) {
            state.userSettings = { timezone_primary: 'America/Chicago', weekly_rental_cost: 350 };
        }
        
        await Garage.fetchFleet();
        await refreshAll();
        
        // Audit auto-load
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            setTimeout(() => Finance.refreshAudit(), 500);
        }

        setupRealtime();
    } else {
        if(authScreen) authScreen.classList.remove('hidden');
        if(appContent) appContent.classList.add('hidden');
    }
    
    window.addEventListener('refresh-data', refreshAll);
    setInterval(() => { if (!localStorage.getItem('theme')) initTheme(); }, 60000);
}

// DUOMENŲ ATNAUJINIMAS
export async function refreshAll() {
    try {
        const { data: shift } = await db
            .from('finance_shifts').select('*').in('status', ['active', 'paused'])
            .eq('user_id', state.user.id).order('start_time', { ascending: false }).limit(1).maybeSingle();
        
        state.activeShift = shift;
        UI.updateUI('activeShift');
        
        if (state.activeShift) Shifts.startTimer();
        else Shifts.stopTimer();
        
        await updateProgressBars();
        
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) Finance.refreshAudit();
    } catch (error) { console.error('Refresh Error:', error); }
}

async function updateProgressBars() {
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
    } catch (e) { console.error("Bar error", e); }
}

function setupRealtime() {
    const userId = state.user.id;
    db.channel('user-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_shifts', filter: `user_id=eq.${userId}` }, refreshAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${userId}` }, refreshAll)
        .subscribe();
}

// ════════════════════════════════════════════════════════════════
// 3. GLOBALŪS KVIETIMAI (WINDOW BINDING)
// ════════════════════════════════════════════════════════════════

// Auth
window.login = Auth.login;
window.logout = Auth.logout;

// Theme & UI
window.cycleTheme = () => {
    const root = document.documentElement;
    const isLight = root.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    if(navigator.vibrate) navigator.vibrate(10);
    if(UI.applyTheme) UI.applyTheme();
};
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;
window.closeModals = UI.closeModals;

// Garage
window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
window.editVehicle = Garage.editVehicle;
window.deleteVehicle = Garage.deleteVehicle;
window.confirmDeleteVehicle = Garage.confirmDeleteVehicle; 
window.cancelDeleteVehicle = Garage.cancelDeleteVehicle; 
window.setVehType = Garage.setVehType;
window.toggleTestMode = Garage.toggleTestMode;

// Shifts
window.openStartModal = Shifts.openStartModal;
window.confirmStart = Shifts.confirmStart;
window.openEndModal = Shifts.openEndModal;
window.confirmEnd = Shifts.confirmEnd;
window.togglePause = Shifts.togglePause;
window.selectWeather = Shifts.selectWeather;

// Settings
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

// PASTABA: Finansų funkcijos (window.requestLogDelete ir t.t.) yra pačiame finance.js

document.addEventListener('DOMContentLoaded', init);
