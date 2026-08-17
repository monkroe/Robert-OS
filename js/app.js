// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v2.0.2
// Purpose: System bootstrap + bindings + refresh cycle with safe cleanup
//
// FIX v2.0.2:
// - Centralized all window.* bindings (single hub)
// - Fixed audit tab visibility check (uses .active class)
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
import * as SessionSync from './modules/session-sync.js';
import * as SessionController from './modules/session-controller.js';
import * as SessionSyncDebug from './modules/session-sync-debug.js'; // TEMPORARY, see file header

let refreshBound = false;
let lifecycleBound = false;

async function init() {
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
      await Settings.loadSettings();

      UI.applyTheme();
      UI.startClocks();

      await Garage.fetchFleet();
      await refreshAll();

      // Session Domain Multi-Door milestone, step 3: resumes Realtime
      // observation of work_sessions if this client already has a Benas
      // session (from a prior login's bootstrap). Isolated failure handling
      // -- this is new, unproven code, and it must never take down the
      // primary init sequence above it.
      try {
        await SessionSync.resumeIfBootstrapped();
      } catch (e) {
        console.warn('⚠️ session-sync: resumeIfBootstrapped failed:', e);
      }

      // PWA canonical session controller, step 4b: registers the
      // canonical UI re-render on every relevant state change and paints
      // once immediately. Runs after resumeIfBootstrapped() above has
      // resolved, so the first paint reflects real readiness, not the
      // initial 'loading' default. Isolated failure handling, same reason
      // as resumeIfBootstrapped above -- new, unproven code must never
      // take down the primary init sequence.
      try {
        SessionController.initCanonicalUI();
      } catch (e) {
        console.warn('⚠️ session-controller: initCanonicalUI failed:', e);
      }

      // TEMPORARY, §9 acceptance test only -- see session-sync-debug.js
      // header for removal instructions.
      try {
        SessionSyncDebug.mount();
      } catch (e) {
        console.warn('⚠️ session-sync-debug: mount failed:', e);
      }

      bindRefreshOnce();
      bindLifecycleCleanupOnce();
    } catch (e) {
      console.error(e);
    }
  } else {
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
      // Session Domain Multi-Door milestone, §9 recovery half: catches up
      // the canonical Benas session if a Realtime event was missed while
      // backgrounded. Fire-and-forget (refetchCanonical never throws, see
      // session-sync.js) -- this listener's own job (clocks) is already
      // done by the line above and must not wait on this.
      SessionSync.refetchCanonical();
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

    // PWA canonical session controller, step 4b: #shift-timer/#btn-start/
    // #active-controls/#btn-pause are now owned UNCONDITIONALLY by
    // session-controller.js's renderCanonicalSession() (registered once via
    // initCanonicalUI(), reacting to canonical state changes) -- for EVERY
    // readiness/status combination: 'loading', 'unavailable', 'ready'+'none',
    // 'ready'+'active', 'ready'+'paused'. "canonical ready + none is an
    // authoritative NONE, not a legacy-fallback signal" applies here exactly
    // as everywhere else in this cutover -- there is no combination in which
    // this refreshAll() call site may still render these elements, so
    // nothing here checks canonicalView at all. An earlier version of this
    // guard checked `status !== 'none'`, which is wrong: it let 'ready'+'none'
    // fall through to this block, exactly the split-brain the readiness
    // model exists to prevent (a stale state.activeShift could then render
    // as a phantom legacy shift while canonical was correctly reporting
    // none). Caught before this shipped, not after.
    //
    // Legacy DOM writes for these four elements are REMOVED from this call
    // site, not left as a dead conditional branch -- a branch that always
    // evaluates one way reads as a bug waiting to happen, not a design.
    // shifts.js itself is unmodified and git history has the prior version
    // of this block; a full rollback reinstates both together with
    // reverting app.js's window.* bindings, never a runtime toggle between
    // the two systems.
    //
    // state.activeShift is still tracked above -- costs.js/finance.js and
    // shifts.js's own (now button-unreachable) functions still read it.
    // Only the DOM rendering derived from it, for these specific shared
    // elements, stops here.

    await updateProgressBars();

    // v2.0.2 fix: check .active class instead of .hidden
    const auditTab = document.getElementById('tab-audit');
    if (auditTab && auditTab.classList.contains('active')) {
      await Finance.refreshAudit();
    }
  } catch (error) {
    console.error(error);
  }
}

function toFiniteNumber(v, fallback = 0) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

async function updateProgressBars() {
  if (!state.user) return;

  try {
    const rentalProgress = await Costs.calculateWeeklyRentalProgress();
    const rentalEarned = toFiniteNumber(rentalProgress?.earned, 0);
    const rentalTarget = toFiniteNumber(rentalProgress?.target, 0);

    UI.renderProgressBar('rental-bar', rentalEarned, rentalTarget);
    UI.renderProgressText('rental-val', `$${Math.round(rentalEarned)} / $${Math.round(rentalTarget)}`);

    const dailyCost = toFiniteNumber(await Costs.calculateDailyCost(), 0);
    const shiftEarnings = toFiniteNumber(await Costs.calculateShiftEarnings(), 0);

    UI.renderProgressBar('grind-bar', shiftEarnings, dailyCost);
    UI.renderProgressText('grind-val', `$${Math.round(shiftEarnings)} / $${Math.round(dailyCost)}`);

    const earningsEl = document.getElementById('shift-earnings');
    if (earningsEl) earningsEl.textContent = `$${Math.round(shiftEarnings)}`;
  } catch (e) {
    console.error(e);
  }
}

// ────────────────────────────────────────────────────────────────
// GLOBAL BINDINGS (v2.0.2: single centralized hub)
// ────────────────────────────────────────────────────────────────

// Auth
window.login = Auth.login;
window.logout = Auth.logout;

// UI
window.cycleTheme = UI.cycleTheme;
window.switchTab = UI.switchTab;
window.openModal = UI.openModal;
window.closeModals = UI.closeModals;

// Settings
window.openSettings = Settings.openSettings;
window.saveSettings = Settings.saveSettings;

// Garage
window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
window.editVehicle = Garage.editVehicle;
window.deleteVehicle = Garage.deleteVehicle;
window.confirmDeleteVehicle = Garage.confirmDeleteVehicle;
window.cancelDeleteVehicle = Garage.cancelDeleteVehicle;
window.setVehType = Garage.setVehType;
window.toggleTestMode = Garage.toggleTestMode;

// Shifts -- PWA canonical session controller, step 4b: repointed from
// Shifts.* to SessionController.*. shifts.js itself is unmodified and
// remains the full rollback path -- reverting these five lines to
// Shifts.* (and Shifts.togglePause for the sixth) is the entire rollback,
// no other file needs to change.
window.openStartModal = SessionController.openStartModal;
window.confirmStart = SessionController.confirmStart;
window.openEndModal = SessionController.openEndModal;
window.confirmEnd = SessionController.confirmEnd;
window.togglePause = SessionController.togglePauseClick;
window.selectWeather = Shifts.selectWeather;

// Finance (TX + Audit)
window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;
window.toggleSelectAll = Finance.toggleSelectAll;
window.requestLogDelete = Finance.requestLogDelete;
window.confirmLogDelete = Finance.confirmLogDelete;
window.exportAI = Finance.exportAI;
window.updateDeleteButtonLocal = Finance.updateDeleteButtonLocal;
window.openShiftDetails = Finance.openShiftDetails;
window.toggleAccordion = Finance.toggleAccordion;

// ────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
