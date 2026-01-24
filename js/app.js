// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS (ORCHESTRATOR)
// Versija: 1.2
// 
// ATSAKOMYBĖ: Sistemos orkestravimas (Dirigentas)
// NIEKADA neskaičiuoja - tik koordinuoja modulius
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
// INIT - Sistema paleidžiama
// ────────────────────────────────────────────────────────────────

async function init() {
    UI.applyTheme();
    
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        // 1. Užkrauti settings (turi būti pirma)
        await Settings.loadSettings();
        
        // 2. Užkrauti garažą
        await Garage.fetchFleet();
        
        // 3. Užkrauti aktyvią pamainą ir atnaujinti UI
        await refreshAll();
        
        // 4. Įjungti realtime
        setupRealtime();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
    
    // Event listeners
    window.addEventListener('refresh-data', () => {
        refreshAll();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'auto') UI.applyTheme();
    });
}

// ────────────────────────────────────────────────────────────────
// REFRESH ALL - Pagrindinis atnaujinimas
// ────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────
// UPDATE PROGRESS BARS
// ────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────
// REALTIME SETUP
// ────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────
// EXPOSE TO WINDOW (Global funkcijos)
// ────────────────────────────────────────────────────────────────

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

// Finance
window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;
window.exportAI = Finance.exportAI;

// UI
window.cycleTheme = UI.cycleTheme;
window.switchTab = UI.switchTab;

// Universal closeModals (PATAISYMAS)
window.closeModals = function() {
    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.classList.add('hidden');
    });
};

// Settings
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

// ────────────────────────────────────────────────────────────────
// START
// ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
