// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS (ORCHESTRATOR)
// Versija: 1.2 FINAL
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
// INIT
// ────────────────────────────────────────────────────────────────

async function init() {
    UI.applyTheme();
    
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        // 1. Settings (with error handling)
        try {
            await Settings.loadSettings();
        } catch (error) {
            console.warn('⚠️ Settings load failed, using defaults:', error);
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
        
        // 2. Garage
        try {
            await Garage.fetchFleet();
        } catch (error) {
            console.warn('⚠️ Garage load failed:', error);
        }
        
        // 3. Refresh
        await refreshAll();
        
        // 4. Realtime
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

// ────────────────────────────────────────────────────────────────
// REFRESH ALL
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
        
        // PATAISYMAS: Safe audit refresh
        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            try {
                if (Finance.refreshAudit) {
                    await Finance.refreshAudit();
                }
            } catch (error) {
                console.warn('⚠️ Audit refresh failed:', error);
            }
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
