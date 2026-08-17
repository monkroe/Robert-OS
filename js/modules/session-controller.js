// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SESSION-CONTROLLER.JS v1.1.0
// Purpose: Orchestration layer between canonical write functions
//          (session-sync.js) and the START/PAUSE/RESUME/END actions, and
//          (step 4b) the DOM that drives and displays them.
//
// PWA canonical session controller. Step 4a: pure action functions
// (startSession/togglePause/endSession below), no DOM. Step 4b: DOM-facing
// exports added further down (openStartModal, confirmStart, togglePauseClick,
// openEndModal, confirmEnd, initCanonicalUI) -- these are what app.js binds
// window.* to and calls from init(). The step 4a functions are unchanged by
// this addition and are called BY the step 4b layer, not duplicated.
// robert-os-hub/docs/05-roadmap/session-domain-multi-door-milestone.md §9
//
// READINESS GATE, not a canonical-vs-legacy dispatcher. Every action here
// checks getCanonicalSessionView() first and refuses (returns an error
// result, calls nothing) unless readiness === 'ready'. This module never
// falls back to legacy shifts.js at runtime -- session-domain-multi-door-milestone.md's
// "no runtime legacy fallback after cutover" fix means legacy stays
// reachable only by reverting app.js's button bindings wholesale, a full
// rollback, not a live branch inside this file.
//
// VEHICLE IDENTITY, step 4b: the START vehicle picker is sourced from
// bf_vehicles via benasDb, NEVER from state.fleet/PWA vehicles -- the two
// projects use different UUIDs for the same real vehicle, confirmed live
// (session-domain-multi-door-milestone.md, "RPC parameter mapping").
//
// WEATHER, step 4b: #end-weather's value is read by legacy's own
// selectWeather() (unchanged, still bound in app.js) but is never sent to
// rpc_session_end -- canonical work_sessions has no weather field. An
// explicit boundary, not an oversight.
//
// ODO MONOTONICITY, found missing and closed the same day as the first
// live acceptance test (2026-08-17): rpc_session_start itself enforces
// only odo_start >= 0 -- the "odo must not go backward" rule the Benas bot
// enforces (index.ts's conversational flow, and again in database.ts's
// startShift() right before calling the RPC) was never ported here, since
// it lives entirely in the bot's own TypeScript, a different codebase.
// Closed by calling the SAME DB-level function the bot calls,
// bf_get_global_last_odo (see fetchLastOdo()'s own docstring below) --
// not a reimplementation, the identical source of truth. rpc_session_start
// itself is NOT changed; this stays a client-side guard on both doors,
// exactly as the bot's own "TEMPORARY bot-level guard" comment already
// described before this file existed.
//
// NOT closed here, recorded for later: bf_get_global_last_odo also grants
// EXECUTE to anon (confirmed live) -- likely low-risk, since it is
// SECURITY INVOKER over RLS-protected tables (an anon caller should get
// null/no data back, not another user's odometer), but this was not
// verified to the same standard as the rpc_session_* grant audits earlier
// in this milestone, and is out of scope for this patch specifically.
//
// DOM CONFLICT WITH LEGACY, resolved in app.js not here: refreshAll()'s
// existing calls to Shifts.startTimer/stopTimer and UI.updateUI('activeShift')
// write to the SAME #shift-timer/#btn-start/#active-controls/#btn-pause
// elements this module's renderCanonicalSession() does. app.js now skips
// those legacy calls whenever canonical readiness is 'ready' and status is
// not 'none' -- see app.js's own comment at that guard. shifts.js and
// ui.js's existing updateUI() are both unmodified.
// ════════════════════════════════════════════════════════════════

import { getCanonicalSessionView, deriveElapsedActiveMs } from './canonical-session-view.js';
import * as SessionSync from './session-sync.js';
import { openModal, closeModals, updateCanonicalUI } from './ui.js';
import { showToast, vibrate } from '../utils.js';
import { state, onStateChange } from '../state.js';

function notReadyResult(view) {
    return { data: null, error: { message: `canonical session not ready (readiness=${view.readiness})` } };
}

function wrongPhaseResult(message) {
    return { data: null, error: { message } };
}

/**
 * params: { logical_date, vehicle, odo_start, target_minutes, notes } --
 * see session-sync.js's startCanonicalSession for the exact shape.
 * Refuses unless status === 'none' (no active session) -- the RPC itself
 * would also refuse via the partial unique index, but checking here first
 * avoids a round trip for the common "double-click" case.
 */
export async function startSession(params) {
    const view = getCanonicalSessionView();
    if (view.readiness !== 'ready') return notReadyResult(view);
    if (view.status !== 'none') {
        return wrongPhaseResult(`cannot start: session already ${view.status}`);
    }
    return await SessionSync.startCanonicalSession(params);
}

/**
 * PAUSE or RESUME, decided from the current view's status -- callers do
 * not choose which one. 'active' pauses, 'paused' resumes, anything else
 * refuses.
 */
export async function togglePause() {
    const view = getCanonicalSessionView();
    if (view.readiness !== 'ready') return notReadyResult(view);
    if (view.status === 'active') return await SessionSync.pauseCanonicalSession();
    if (view.status === 'paused') return await SessionSync.resumeCanonicalSession();
    return wrongPhaseResult('no active session to pause/resume');
}

/**
 * params: { odo_end, money } -- see session-sync.js's endCanonicalSession
 * for the exact shape and the active_duration return-value contract.
 * Refuses unless status is 'active' or 'paused'.
 */
export async function endSession(params) {
    const view = getCanonicalSessionView();
    if (view.readiness !== 'ready') return notReadyResult(view);
    if (view.status !== 'active' && view.status !== 'paused') {
        return wrongPhaseResult('no active session to end');
    }
    return await SessionSync.endCanonicalSession(params);
}

// ────────────────────────────────────────────────────────────────
// STEP 4B -- DOM-facing layer. Everything below reads form fields,
// manipulates modals, and is what app.js binds window.* to.
// ────────────────────────────────────────────────────────────────

function toInt(v) {
    const n = parseInt(String(v ?? '').trim(), 10);
    return Number.isFinite(n) ? n : 0;
}

function toFloat(v) {
    const n = parseFloat(String(v ?? '').trim());
    return Number.isFinite(n) ? n : 0;
}

function getDefaultTargetHours() {
    const def = Number(state.userSettings?.default_shift_target_hours ?? 12);
    return Number.isFinite(def) && def > 0 ? def : 12;
}

/** en-CA formats as YYYY-MM-DD directly -- no manual string building. */
function todayLogicalDateChicago() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date());
}

/**
 * bf_vehicles for the signed-in canonical user, via benasDb -- never
 * state.fleet/PWA vehicles (see the header comment's VEHICLE IDENTITY
 * note). Returns [] on any failure rather than throwing, matching how
 * session-sync.js's own functions never let a failure here break a
 * caller's UI flow.
 */
async function fetchCanonicalVehicles() {
    try {
        const { data: { session } } = await SessionSync.benasDb.auth.getSession();
        if (!session) return [];
        const { data, error } = await SessionSync.benasDb
            .from('bf_vehicles')
            .select('*')
            .eq('user_id', session.user.id);
        if (error) {
            console.warn('⚠️ session-controller: bf_vehicles fetch failed:', error.message);
            return [];
        }
        return data || [];
    } catch (err) {
        console.warn('⚠️ session-controller: bf_vehicles fetch threw:', err);
        return [];
    }
}

/**
 * The SAME DB-level odo monotonicity check the Benas bot enforces before
 * calling rpc_session_start (benas-bot/supabase/functions/benas/database.ts
 * startShift() -- "TEMPORARY bot-level guard... The session-domain
 * invariant lives in the RPC" -- it does not; this is the guard). Confirmed
 * live, 2026-08-17: bf_get_global_last_odo(p_user_id, p_vehicle_id) is
 * GREATEST(last bf_shifts odo, last bf_fuel_logs odo) -- already granted
 * EXECUTE to authenticated. Returns null (not 0) when there is no prior
 * reading, matching the RPC's own NULLIF(..., 0) -- callers must treat
 * null as "no floor to enforce", not as a literal 0.
 */
async function fetchLastOdo(vehicleId) {
    try {
        const { data: { session } } = await SessionSync.benasDb.auth.getSession();
        if (!session || !vehicleId) return null;
        const { data, error } = await SessionSync.benasDb.rpc('bf_get_global_last_odo', {
            p_user_id: session.user.id,
            p_vehicle_id: vehicleId,
        });
        if (error) {
            console.warn('⚠️ session-controller: bf_get_global_last_odo failed:', error.message);
            return null;
        }
        return typeof data === 'number' ? data : null;
    } catch (err) {
        console.warn('⚠️ session-controller: bf_get_global_last_odo threw:', err);
        return null;
    }
}

/** Refetches and shows the last-known ODO for whichever vehicle is
 * currently selected -- called once at modal-open and again on every
 * #start-vehicle change, so switching vehicles never leaves a stale
 * other-vehicle's number sitting in the field. */
async function applyLastOdoToUI(vehicleId) {
    const odoEl = document.getElementById('start-odo');
    if (!odoEl) return;
    const last = await fetchLastOdo(vehicleId);
    odoEl.placeholder = last != null ? String(last) : '123456';
    if (!odoEl.value) {
        odoEl.value = last != null ? String(last) : '';
    }
}

/** Mirrors benas-bot database.ts's getActiveVehicleId() -- bf_users.active_vehicle_id
 * only, no bf_bot_sessions.temp_data fallback (the PWA has no bot-flow session of
 * its own for that fallback to read). */
async function fetchActiveVehicleId() {
    try {
        const { data: { session } } = await SessionSync.benasDb.auth.getSession();
        if (!session) return null;
        const { data, error } = await SessionSync.benasDb
            .from('bf_users')
            .select('active_vehicle_id')
            .eq('id', session.user.id)
            .maybeSingle();
        if (error) {
            console.warn('⚠️ session-controller: bf_users.active_vehicle_id fetch failed:', error.message);
            return null;
        }
        return data?.active_vehicle_id || null;
    } catch (err) {
        console.warn('⚠️ session-controller: bf_users.active_vehicle_id fetch threw:', err);
        return null;
    }
}

export async function openStartModal() {
    vibrate();
    const view = getCanonicalSessionView();
    if (view.readiness !== 'ready' || view.status !== 'none') return;

    const select = document.getElementById('start-vehicle');
    if (!select) return showToast('UI error: missing vehicle selector', 'error');

    select.innerHTML = '<option value="">Loading fleet...</option>';
    const vehicles = await fetchCanonicalVehicles();
    select.innerHTML = vehicles.length
        ? vehicles.map((v) => `<option value="${v.id}">${v.name}</option>`).join('')
        : '<option value="">No vehicles found</option>';

    const activeVehicleId = await fetchActiveVehicleId();
    if (activeVehicleId && vehicles.some((v) => v.id === activeVehicleId)) {
        select.value = activeVehicleId;
    }

    const goalEl = document.getElementById('start-goal');
    if (goalEl && (goalEl.value === '' || goalEl.value == null)) {
        goalEl.value = String(getDefaultTargetHours());
    }

    const odoEl = document.getElementById('start-odo');
    if (odoEl) odoEl.value = '';

    select.onchange = () => applyLastOdoToUI(select.value);
    await applyLastOdoToUI(select.value);

    openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);

    const select = document.getElementById('start-vehicle');
    const vehicleId = select?.value;
    const vehicleName = select?.selectedOptions?.[0]?.textContent || '';
    const startOdoRaw = document.getElementById('start-odo')?.value;
    const targetRaw = document.getElementById('start-goal')?.value;

    if (!vehicleId) return showToast('Pasirinkite automobilį', 'warning');

    const startOdo = toInt(startOdoRaw);

    // Re-fetched fresh here, not trusted from the modal-open prefill --
    // matches legacy shifts.js's own confirmStart(), which re-fetches its
    // equivalent (fetchVehicleStartMinOdo) at confirm time rather than
    // relying on whatever was shown when the modal opened.
    const lastOdo = await fetchLastOdo(vehicleId);
    if (lastOdo !== null && startOdo < lastOdo) {
        return showToast(`Rida negali būti mažesnė nei paskutinė (${lastOdo})`, 'warning');
    }

    const targetHours = toFloat(targetRaw) || getDefaultTargetHours();
    const targetMinutes = Math.round(targetHours * 60);

    state.loading = true;
    try {
        const { error } = await startSession({
            logical_date: todayLogicalDateChicago(),
            vehicle: { id: vehicleId, name: vehicleName, plate: null },
            odo_start: startOdo || null,
            target_minutes: targetMinutes,
            notes: null,
        });

        if (error) {
            showToast(error.message || 'Start error', 'error');
            return;
        }

        showToast('START SHIFT', 'success');
        closeModals();
    } catch (e) {
        showToast(e?.message || 'Start error', 'error');
    } finally {
        state.loading = false;
    }
}

/**
 * Bound to the SAME button legacy's togglePause() was -- named differently
 * (not togglePause) only because step 4a already exports a pure function
 * of that name with a different signature (no vibrate, no toast, no DOM).
 * This is the DOM-facing wrapper app.js's window.togglePause points to.
 *
 * Deliberately NOT optimistic: no button/timer DOM write happens here.
 * The visible change comes from the Realtime-driven re-render, exactly
 * the same path a bot-originated pause/resume already takes -- see this
 * file's header, "one code path for both directions".
 */
export async function togglePauseClick() {
    vibrate();
    const { error } = await togglePause();
    if (error) {
        console.error(error);
        showToast(error.message || 'Pause error', 'error');
    }
}

export function openEndModal() {
    vibrate();
    const view = getCanonicalSessionView();
    if (view.readiness !== 'ready' || (view.status !== 'active' && view.status !== 'paused')) return;

    const endOdoEl = document.getElementById('end-odo');
    if (endOdoEl && !endOdoEl.value) {
        endOdoEl.value = String(view.start_odo ?? '');
    }

    document.querySelectorAll('.weather-btn').forEach((b) => {
        b.classList.remove('border-teal-500', 'bg-teal-500/20');
    });
    const hiddenWeather = document.getElementById('end-weather');
    if (hiddenWeather) hiddenWeather.value = '';

    openModal('end-modal');
}

/**
 * money.gross_earnings only -- weather is intentionally not read from
 * #end-weather here (see header comment). On success, the toast shows the
 * server's own returned active_duration, not a client-side prediction --
 * the END-while-PAUSED correctness contract this milestone's B-parity
 * decision depends on (canonical-session-view.js's deriveElapsedActiveMs
 * docstring, and session-sync.js's endCanonicalSession docstring).
 */
export async function confirmEnd() {
    vibrate([20]);

    const endOdoRaw = document.getElementById('end-odo')?.value;
    const earnRaw = document.getElementById('end-earn')?.value;

    if (endOdoRaw === '' || endOdoRaw == null) return showToast('Įveskite ridą', 'warning');
    if (earnRaw === '' || earnRaw == null) return showToast('Įveskite uždarbį', 'warning');

    const endOdo = toInt(endOdoRaw);
    const earn = toFloat(earnRaw);

    state.loading = true;
    try {
        const { data, error } = await endSession({
            odo_end: endOdo,
            money: { gross_earnings: earn },
        });

        if (error) {
            showToast(error.message || 'End error', 'error');
            return;
        }

        const activeDuration = data?.active_duration;
        showToast(activeDuration ? `END SHIFT -- worked ${activeDuration}` : 'END SHIFT', 'success');
        closeModals();
    } catch (e) {
        showToast(e?.message || 'End error', 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// CANONICAL UI RENDERING + TIMER -- reacts to state changes, never polled
// from refreshAll(). Registered once via initCanonicalUI().
// ────────────────────────────────────────────────────────────────

let timerInterval = null;

function pad(n) {
    return n < 10 ? '0' + n : String(n);
}

function renderTimerText(view) {
    const el = document.getElementById('shift-timer');
    if (!el || (view.status !== 'active' && view.status !== 'paused')) return;

    const ms = deriveElapsedActiveMs(view);
    if (ms == null) return;

    const hrs = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((ms % (1000 * 60)) / 1000);
    el.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * The single re-render entry point: updateCanonicalUI (buttons) + timer
 * text/interval, both driven by the SAME getCanonicalSessionView() call so
 * they can never disagree with each other mid-render.
 *
 * The interval keeps ticking through 'paused', not just 'active' --
 * deriveElapsedActiveMs's own formula makes the displayed value naturally
 * hold steady during a pause (both `now` and the growing open-pause
 * offset advance together), so there is no need to special-case
 * start/stop around pause/resume the way legacy's shifts.js does.
 */
function renderCanonicalSession() {
    const view = getCanonicalSessionView();
    updateCanonicalUI(view);

    const timerEl = document.getElementById('shift-timer');
    const running = view.status === 'active' || view.status === 'paused';

    if (running) {
        renderTimerText(view);
        if (!timerInterval) {
            timerInterval = setInterval(() => renderTimerText(getCanonicalSessionView()), 1000);
        }
        timerEl?.classList.remove('opacity-50');
        timerEl?.classList.add('pulse-text');
    } else {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        timerEl?.classList.add('opacity-50');
        timerEl?.classList.remove('pulse-text');
    }
}

let initialized = false;

/**
 * Call once from app.js's init(), after SessionSync.resumeIfBootstrapped()
 * has resolved. Registers a render on every canonical state field this
 * module cares about, then paints once immediately so the UI does not wait
 * for the next change to reflect what is already known.
 */
export function initCanonicalUI() {
    if (initialized) return;
    initialized = true;

    onStateChange('_benasSessionPreview', renderCanonicalSession);
    onStateChange('_benasOpenPause', renderCanonicalSession);
    onStateChange('_benasCanonicalStatus', renderCanonicalSession);

    renderCanonicalSession();
}
