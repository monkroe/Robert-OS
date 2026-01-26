// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS (ORCHESTRATOR) 1.7.5 (FINAL STABLE)
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

// 1. TEMOS VALDYMAS (AUTO + MANUAL)
function initTheme() {
    const root = document.documentElement;
    const saved = localStorage.getItem('theme');
    const hour = new Date().getHours();

    // Jei vartotojas yra pasirinkęs rankiniu būdu
    if (saved === 'dark') {
        root.classList.remove('light');
    } else if (saved === 'light') {
        root.classList.add('light');
    } else {
        // Auto režimas: 7:00 - 19:00 Šviesu
        if (hour >= 7 && hour < 19) {
            root.classList.add('light');
        } else {
            root.classList.remove('light');
        }
    }
    
    // UI atnaujinimas (jei reikia specifinių UI pakeitimų)
    if (UI && UI.applyTheme) UI.applyTheme();
}

// 2. SISTEMOS INICIALIZAVIMAS
async function init() {
    // Pirmiausia nustatome temą, kad nesimatytų "blykstėjimo"
    initTheme();
    
    // Tikriname sesiją
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        // Nustatymų krovimas
        try {
            await Settings.loadSettings();
        } catch (error) {
            console.warn('Settings load failed, using defaults');
            state.userSettings = {
                timezone_primary: 'America/Chicago',
                timezone_secondary: 'Europe/Vilnius',
                weekly_rental_cost: 350,
                rental_week_start_day: 2
            };
        }
        
        // Duomenų krovimas
        await Garage.fetchFleet();
        await refreshAll();
        setupRealtime();
        
        // Jei esame audit tab'e, atnaujiname jį
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            Finance.refreshAudit();
        }

    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
    
    // Globalus listener duomenų atnaujinimui
    window.addEventListener('refresh-data', refreshAll);

    // Auto temos tikrinimas kas minutę (jei nėra manual override)
    setInterval(() => {
        if (!localStorage.getItem('theme')) initTheme();
    }, 60000);
}

// DUOMENŲ ATNAUJINIMAS
export async function refreshAll() {
    try {
        // 1. Aktyvi pamaina
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
        
        // 2. Progresas ir finansai
        await updateProgressBars();
        
    } catch (error) {
        console.error('Refresh Error:', error);
    }
}

async function updateProgressBars() {
    try {
        // Rental Bar
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

        // Grind Bar (Daily)
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
        if (earningsEl) earningsEl.textContent = `$${Math.round(shiftEarnings)}`;

    } catch (error) {
        console.error('Update Bars Error:', error);
    }
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

// Theme
window.cycleTheme = () => {
    const root = document.documentElement;
    const isLight = root.classList.toggle('light'); // Grąžina true, jei klasė pridėta
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    
    // Vibracija telefonuose
    if (navigator.vibrate) navigator.vibrate(10);
    
    if (UI && UI.applyTheme) UI.applyTheme();
};

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
window.selectWeather = Shifts.selectWeather;

// Finance
window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;
window.exportAI = Finance.exportAI;

// Finance - Delete functionality
window.toggleSelectAll = Finance.toggleSelectAll;
window.requestDelete = Finance.requestDelete; 
window.confirmDelete = Finance.confirmDelete;
window.updateDeleteButton = Finance.updateDeleteButton;

// UI & Navigation
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;
window.closeModals = UI.closeModals;

// Settings
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

// Start App
document.addEventListener('DOMContentLoaded', init);
