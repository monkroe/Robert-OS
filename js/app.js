// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v2.0.0
// Purpose: System bootstrap + bindings + refresh cycle with safe cleanup
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

let refreshBound = false;

async function init() {
    // UI Text Fix (optional – keeps your v1 label)
    const startBtn = document.querySelector('#start-modal .btn-primary-os');
    if (startBtn) startBtn.textContent = 'START SHIFT';

    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');

    const { data: { session } } = await db.auth.getSession();

    if (session) {
        state.user = session.user;
        authScreen?.classList.add('hidden');
        appContent?.classList.remove('hidden');

        try {
            // 1) Load settings first (timezone_primary/secondary)
            await Settings.loadSettings();

            // 2) Apply theme + start clocks (depends on settings + DOM)
            UI.applyTheme();
            UI.startClocks(); // seconds: yes, 1Hz interval

            // 3) Load fleet + initial refresh
            await Garage.fetchFleet();
            await refreshAll();

            bindRefreshOnce();
            bindLifecycleCleanup();
        } catch (e) {
            console.error(e);
        }
    } else {
        // Not logged in: stop clocks/timers to avoid leaks
        UI.stopClocks?.();
        Shifts.stopTimer?.();

        authScreen?.classList.remove('hidden');
        appContent?.classList.add('hidden');

        bindRefreshOnce();
        bindLifecycleCleanup();
        UI.applyTheme();
    }
}

function bindRefreshOnce() {
    if (refreshBound) return;
    refreshBound = true;

    window.addEventListener('refresh-data', refreshAll, { passive: true });

    // If Auth.logout doesn’t already dispatch refresh-data, you can keep it as-is.
    // We do NOT override logout here; just ensure refresh handler exists.
}

function bindLifecycleCleanup() {
    // Prevent duplicated intervals when page is backgrounded / restored
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            UI.stopClocks?.();
        } else {
            // Restart clocks when returning (theme auto sync remains in ui.js)
            if (state.user) UI.startClocks?.();
        }
    });

    // Clean up intervals on unload (memory leak guard)
    window.addEventListener('beforeunload', () => {
        UI.stopClocks?.();
        Shifts.stopTimer?.();
    });
}

export async function refreshAll() {
    if (!state.user) return;

    try {
        const { data: shift, error } = await db
            .from('finance_shifts')
            .select('*')
            .in('status', ['active', 'paused'])
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        state.activeShift = shift || null;

        // ────────────────────────────────────────────────────────
        // TIMER & PAUSE BUTTON SYNC
        // ────────────────────────────────────────────────────────

        const timerEl = document.getElementById('shift-timer');
        const pauseBtn = document.getElementById('btn-pause');

        if (state.activeShift) {
            const isActive = state.activeShift.status === 'active';

            if (isActive) {
                Shifts.startTimer();
                timerEl?.classList.remove('opacity-50');
                timerEl?.classList.add('pulse-text');

                if (pauseBtn) {
                    pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                    pauseBtn.classList.remove('bg-yellow-500/20', 'text-yellow-500');
                }
            } else {
                Shifts.stopTimer();
                timerEl?.classList.add('opacity-50');
                timerEl?.classList.remove('pulse-text');

                if (pauseBtn) {
                    pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                    pauseBtn.classList.add('bg-yellow-500/20', 'text-yellow-500');
                }
            }
        } else {
            Shifts.stopTimer();
            timerEl?.classList.add('opacity-50');
            timerEl?.classList.remove('pulse-text');
        }

        UI.updateUI('activeShift');
        await updateProgressBars();

        const auditTab = document.getElementById('tab-audit');
        if (auditTab && !auditTab.classList.contains('hidden')) {
            await Finance.refreshAudit();
        }
    } catch (error) {
        console.error(error);
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
    } catch (e) {
        console.error(e);
    }
}

// ────────────────────────────────────────────────────────────────
// GLOBAL BINDINGS (single source of truth)
// ────────────────────────────────────────────────────────────────

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
window.openShiftDetails = Finance.openShiftDetails;

document.addEventListener('DOMContentLoaded', init);
