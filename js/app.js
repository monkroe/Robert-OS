// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS (ORCHESTRATOR) 1.7.0 (FINAL STABLE)
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
        // Auto: 7:00 - 19:00 Šviesu
        if (hour >= 7 && hour < 19) root.classList.add('light');
        else root.classList.remove('light');
    }
}

// 2. SISTEMOS INICIALIZAVIMAS
async function init() {
    initTheme();
    UI.applyTheme();
    
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        try {
            await Settings.loadSettings();
        } catch (error) {
            state.userSettings = {
                timezone_primary: 'America/Chicago',
                timezone_secondary: 'Europe/Vilnius',
                weekly_rental_cost: 350,
                rental_week_start_day: 2
            };
        }
        
        await Garage.fetchFleet();
        await refreshAll();
        setupRealtime();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
    
    window.addEventListener('refresh-data', refreshAll);
}

export async function refreshAll() {
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
        
        updateProgressBars();
    } catch (error) {
        console.error('Refresh Error:', error);
    }
}

async function updateProgressBars() {
    const rentalProgress = await Costs.calculateWeeklyRentalProgress();
    const rentalBarEl = document.getElementById('rental-bar');
    const rentalValEl = document.getElementById('rental-val');
    
    if (rentalBarEl && rentalValEl) {
        rentalValEl.textContent = `$${rentalProgress.earned} / $${rentalProgress.target}`;
        rentalBarEl.style.width = `${rentalProgress.percentage}%`;
        
        rentalBarEl.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-500');
        if (rentalProgress.percentage < 70) rentalBarEl.classList.add('bg-red-500');
        else if (rentalProgress.percentage < 90) rentalBarEl.classList.add('bg-yellow-500');
        else rentalBarEl.classList.add('bg-green-500');
    }
}

function setupRealtime() {
    const userId = state.user.id;
    db.channel('user-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_shifts', filter: `user_id=eq.${userId}` }, refreshAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${userId}` }, refreshAll)
        .subscribe();
}

// 3. GLOBALŪS KVIETIMAI (WINDOW BINDING)
window.login = Auth.login;
window.logout = Auth.logout;
window.cycleTheme = () => {
    const root = document.documentElement;
    const isLight = root.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    UI.applyTheme();
};
window.switchTab = UI.switchTab;
window.closeModals = UI.closeModals;
window.openStartModal = Shifts.openStartModal;
window.confirmStart = Shifts.confirmStart;
window.togglePause = Shifts.togglePause;

document.addEventListener('DOMContentLoaded', init);

    // Jei vartotojas jau pasirinko rankiniu būdu, auto nebeveikia
    if (localStorage.getItem('theme')) return;

    const hour = new Date().getHours();
    const root = document.documentElement;
    // 7:00 - 19:00 Šviesu
    if (hour >= 7 && hour < 19) {
        root.classList.add('light');
    } else {
        root.classList.remove('light');
    }
}

// 2. Mygtuko funkcija
window.cycleTheme = function() {
    const root = document.documentElement;
    let newMode;

    if (root.classList.contains('light')) {
        // Buvo šviesi -> darom tamsią
        root.classList.remove('light');
        newMode = 'dark';
    } else {
        // Buvo tamsi -> darom šviesią
        root.classList.add('light');
        newMode = 'light';
    }

    // Išsaugom pasirinkimą visam laikui
    localStorage.setItem('theme', newMode);
    
    // Vizualus patvirtinimas
    if (navigator.vibrate) navigator.vibrate(10);
    // Jei turi showToast funkciją:
    // showToast(newMode === 'dark' ? 'Dark Mode' : 'Light Mode', 'info');
};

// Paleidžiam iškart
initTheme();
// Tikrinam auto laiką kas minutę (tik jei nėra manual override)
setInterval(checkAutoTheme, 60000);

// ────────────────────────────────────────────────────────────────
// 2. MAIN APP INIT (Tavo senas kodas)
// ────────────────────────────────────────────────────────────────


async function init() {
    UI.applyTheme();
    
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        try {
            await Settings.loadSettings();
        } catch (error) {
            console.warn('Settings load failed, using defaults');
            state.userSettings = {
                timezone_primary: 'America/Chicago',
                timezone_secondary: 'Europe/Vilnius',
                clock_position: 'cockpit',
                monthly_fixed_expenses: 0,
                weekly_rental_cost: 350,
                rental_week_start_day: 2,
                default_shift_target_hours: 12,
                notifications_enabled: true,
                compact_mode: false
            };
        }
        
        await Garage.fetchFleet();
        await refreshAll();
        setupRealtime();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
    
    window.addEventListener('refresh-data', () => {
        refreshAll();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'auto') UI.applyTheme();
    });
}

export async function refreshAll() {
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
        
        if (state.activeShift) {
            Shifts.startTimer();
        } else {
            Shifts.stopTimer();
        }
        
        await updateProgressBars();
        
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            Finance.refreshAudit();
        }
    } catch (error) {
        console.error('Error in refreshAll:', error);
    }
}

async function updateProgressBars() {
    try {
        const rentalProgress = await Costs.calculateWeeklyRentalProgress();
        
        const rentalBarEl = document.getElementById('rental-bar');
        const rentalValEl = document.getElementById('rental-val');
        
        if (rentalBarEl && rentalValEl) {
            rentalValEl.textContent = `$${rentalProgress.earned} / $${rentalProgress.target}`;
            rentalBarEl.style.width = `${rentalProgress.percentage}%`;
            
            rentalBarEl.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-500');
            if (rentalProgress.percentage < 70) {
                rentalBarEl.classList.add('bg-red-500');
            } else if (rentalProgress.percentage < 90) {
                rentalBarEl.classList.add('bg-yellow-500');
            } else {
                rentalBarEl.classList.add('bg-green-500');
            }
        }
        
        const dailyCost = await Costs.calculateDailyCost();
        const shiftEarnings = Costs.calculateShiftEarnings();
        
        const grindBarEl = document.getElementById('grind-bar');
        const grindValEl = document.getElementById('grind-val');
        
        if (grindBarEl && grindValEl) {
            const target = Math.round(dailyCost) || 1;
            const current = Math.round(shiftEarnings) || 0;
            const pct = Math.min((current / target) * 100, 100);
            
            grindValEl.textContent = `$${current} / $${target}`;
            grindBarEl.style.width = `${pct}%`;
        }
        
        const earningsEl = document.getElementById('shift-earnings');
        if (earningsEl) {
            earningsEl.textContent = `$${Math.round(shiftEarnings)}`;
        }
    } catch (error) {
        console.error('Error updating progress bars:', error);
    }
}

function setupRealtime() {
    const userId = state.user.id;
    
    db.channel('user-channel')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public',
            table: 'finance_shifts',
            filter: `user_id=eq.${userId}`
        }, () => refreshAll())
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public',
            table: 'expenses',
            filter: `user_id=eq.${userId}`
        }, () => refreshAll())
        .subscribe();
}

// ════════════════════════════════════════════════════════════════
// GLOBAL WINDOW FUNCTIONS
// ════════════════════════════════════════════════════════════════

// Auth
window.login = Auth.login;
window.logout = Auth.logout;

// Garage
window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
window.deleteVehicle = Garage.deleteVehicle;
window.setVehType = Garage.setVehType;
window.toggleTestMode = Garage.toggleTestMode;

// Shifts
window.openStartModal = Shifts.openStartModal;
window.confirmStart = Shifts.confirmStart;
window.openEndModal = Shifts.openEndModal;
window.confirmEnd = Shifts.confirmEnd;
window.togglePause = Shifts.togglePause;
window.selectWeather = Shifts.selectWeather; // ✅ SUTVARKYTA

// Finance
window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;
window.exportAI = Finance.exportAI;

// UI
window.cycleTheme = UI.cycleTheme;
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;     // ✅ SUTVARKYTA
window.closeModals = UI.closeModals;

// Settings
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

// Logika delete (perkelta iš finance jei reikia globaliai, bet paprastai finance turi savo window functions)
window.toggleSelectAll = Finance.toggleSelectAll || window.toggleSelectAll;
window.requestDelete = Finance.requestDelete || window.requestDelete; 
window.confirmDelete = Finance.confirmDelete || window.confirmDelete;
window.updateDeleteButton = Finance.updateDeleteButton || window.updateDeleteButton;

document.addEventListener('DOMContentLoaded', init);
