// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v2.0.1
// Purpose: System bootstrap + bindings + refresh cycle with safe cleanup
// FIXES:
// - Fix broken/duplicated shiftEarnings block (was causing 0/progress issues)
// - Remove duplicate earningsEl assignment
// - Do not await non-async Costs.calculateShiftEarnings()
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
let lifecycleBound = false;

async function init() {
  // Keep your v1 label (optional)
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
      // 1) Settings first (clocks depend on it)
      await Settings.loadSettings();

      // 2) Theme + clocks
      UI.applyTheme();
      UI.startClocks();

      // 3) Fleet + refresh
      await Garage.fetchFleet();
      await refreshAll();

      bindRefreshOnce();
      bindLifecycleCleanupOnce();
    } catch (e) {
      console.error(e);
    }
  } else {
    // Not logged in: stop intervals to avoid leaks
    UI.stopClocks?.();
    Shifts.stopTimer?.();

    authScreen?.classList.remove('hidden');
    appContent?.classList.add('hidden');

    bindRefreshOnce();
    bindLifecycleCleanupOnce();
    UI.applyTheme();
  }
}

function bindRefreshOnce() {
  if (refreshBound) return;
  refreshBound = true;
  window.addEventListener('refresh-data', refreshAll, { passive: true });
}

function bindLifecycleCleanupOnce() {
  if (lifecycleBound) return;
  lifecycleBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      UI.stopClocks?.();
    } else {
      if (state.user) UI.startClocks?.();
    }
  });

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
          // restore v1.8 “running” look (neutral)
          pauseBtn.classList.add('bg-yellow-500/10');
        }
      } else {
        Shifts.stopTimer();
        timerEl?.classList.add('opacity-50');
        timerEl?.classList.remove('pulse-text');

        if (pauseBtn) {
          pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
          // keep paused = yellow hint
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

    // IMPORTANT: calculateShiftEarnings is sync in your Costs.js
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

// optional if you actually implemented it in finance.js
window.toggleAccordion = Finance.toggleAccordion;

document.addEventListener('DOMContentLoaded', init);
