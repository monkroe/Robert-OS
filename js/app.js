// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v1.7.7
// ════════════════════════════════════════════════════════════════

import { db } from './db.js';
import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as Garage from './modules/garage.js';
import * as Shifts from './modules/shifts.js';
import * as Finance from './modules/finance.js'; // Įsitikink, kad importuojama
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
            console.warn('Defaults loaded');
            state.userSettings = {
                timezone_primary: 'America/Chicago',
                timezone_secondary: 'Europe/Vilnius',
                weekly_rental_cost: 350,
                rental_week_start_day: 2
            };
        }
        
        await Garage.fetchFleet();
        await refreshAll();
        
        // Priverstinis Audit užkrovimas jei vartotojas refreshino puslapį būdamas audit tabe
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
    
    setInterval(() => {
        if (!localStorage.getItem('theme')) initTheme();
    }, 60000);
}

// DUOMENŲ ATNAUJINIMAS
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
        
        await updateProgressBars();
        
        // Jei esame audit tabe, atnaujiname ir jį
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            Finance.refreshAudit();
        }
    } catch (error) {
        console.error('Refresh Error:', error);
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
            if (rentalProgress.percentage < 70) rentalBarEl.classList.add('bg-red-500');
            else if (rentalProgress.percentage < 90) rentalBarEl.classList.add('bg-yellow-500');
            else rentalBarEl.classList.add('bg-green-500');
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
        if (earningsEl) earningsEl.textContent = `$${Math.round(shiftEarnings)}`;

    } catch (e) {
        console.error("Bar update error", e);
    }
}

function setupRealtime() {
    const userId = state.user.id;
    db.channel('user-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_shifts', filter: `user_id=eq.${userId}` }, refreshAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${userId}` }, refreshAll)
        .subscribe();
}

// GLOBALŪS KVIETIMAI
window.login = Auth.login;
window.logout = Auth.logout;

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

window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
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

// Finance modulio funkcijos dabar pasiekiamos tiesiai iš modulio,
// bet paliekame čia dėl aiškumo
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

document.addEventListener('DOMContentLoaded', init);
