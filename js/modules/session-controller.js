// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SESSION-CONTROLLER.JS v1.0.0
// Purpose: Orchestration layer between canonical write functions
//          (session-sync.js) and the START/PAUSE/RESUME/END actions.
//
// PWA canonical session controller, step 4a.
// robert-os-hub/docs/05-roadmap/session-domain-multi-door-milestone.md §9
//
// SCOPE, DELIBERATE, step 4a: no DOM access, no modal wiring, no
// window.* bindings. Every exported function here takes already-extracted
// parameters (or none) and returns the underlying RPC's {data, error} --
// it does not read document.getElementById(...) anywhere. Reading form
// fields, populating the vehicle picker from bf_vehicles, and binding
// these functions to actual buttons is step 4b, a separate commit.
//
// READINESS GATE, not a canonical-vs-legacy dispatcher. Every action here
// checks getCanonicalSessionView() first and refuses (returns an error
// result, calls nothing) unless readiness === 'ready'. This module never
// falls back to legacy shifts.js at runtime -- session-domain-multi-door-milestone.md's
// "no runtime legacy fallback after cutover" fix means legacy stays
// reachable only by reverting app.js's button bindings wholesale, a full
// rollback, not a live branch inside this file.
// ════════════════════════════════════════════════════════════════

import { getCanonicalSessionView } from './canonical-session-view.js';
import * as SessionSync from './session-sync.js';

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
