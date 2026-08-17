// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/CANONICAL-SESSION-VIEW.JS v1.0.0
// Purpose: Pure selector deriving a UI-shaped view from the canonical
//          Benas session state session-sync.js maintains.
//
// PWA canonical session controller, step 3.
// robert-os-hub/docs/05-roadmap/session-domain-multi-door-milestone.md §9
//
// SCOPE, DELIBERATE: pure functions only. No RPC calls (read or write), no
// DOM access, no UI wiring, no subscription. Reads state._benasSessionPreview,
// state._benasSessionPauses, state._benasOpenPause and state._benasCanonicalStatus
// (all written by session-sync.js) and never writes to state itself. Never
// reads or writes state.activeShift -- the legacy and canonical read-models
// stay fully separate; nothing here decides which one a consumer should use.
//
// TWO SEPARATE AXES IN THE RETURNED VIEW, deliberately not flattened into
// one field:
//   readiness: 'loading' | 'ready' | 'unavailable' -- can the canonical
//     SOURCE be trusted right now. Mirrors state._benasCanonicalStatus
//     directly.
//   status: 'none' | 'active' | 'paused' | null -- the SESSION's phase,
//     meaningful only when readiness === 'ready'. null for 'loading' and
//     'unavailable', so a consumer can never mistake "we don't know yet"
//     or "we can't reach canonical truth" for a real session phase by
//     switching on status alone.
// A future UI must disable session controls for BOTH readiness==='loading'
// and readiness==='unavailable' (session-domain-multi-door-milestone.md,
// "no runtime legacy fallback after cutover" fix) -- keeping them on
// separate axes from status is what makes that check a single, obvious
// condition instead of five cases to enumerate.
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';

/**
 * Sums CLOSED session_pauses durations only, each individually floored to
 * whole minutes before summing -- the exact rule rpc_session_end applies
 * server-side (benas-bot db/v2-sessions-rpcs.sql:318-320,
 * `sum(GREATEST(0, floor(extract(epoch FROM (pause_end - pause_start)) / 60)))`).
 * An open pause (pause_end null) is deliberately excluded here -- it is not
 * "banked" yet, and is handled separately via open_pause_started_at so a
 * live view can extrapolate it without waiting for it to close.
 */
function computeAccumulatedPauseMs(pauses) {
    let totalMinutes = 0;
    for (const p of pauses || []) {
        if (!p.pause_end) continue;
        const seconds = (new Date(p.pause_end).getTime() - new Date(p.pause_start).getTime()) / 1000;
        totalMinutes += Math.max(0, Math.floor(seconds / 60));
    }
    return totalMinutes * 60 * 1000;
}

/**
 * The canonical view. Reads state only -- never fetches, never subscribes.
 * Call it again after any state change (e.g. from an onStateChange listener
 * a later step adds) rather than caching the result.
 */
export function getCanonicalSessionView() {
    const readiness = state._benasCanonicalStatus;

    if (readiness === 'loading') {
        return { readiness: 'loading', status: null };
    }

    if (readiness === 'unavailable') {
        return { readiness: 'unavailable', status: null, error: state._benasCanonicalError };
    }

    // readiness === 'ready'
    const session = state._benasSessionPreview;
    if (!session) {
        return { readiness: 'ready', status: 'none' };
    }

    const openPause = state._benasOpenPause;
    const metadata = session.metadata || {};

    return {
        readiness: 'ready',
        status: openPause ? 'paused' : 'active',
        id: session.id,
        start_time: session.start_time,
        start_odo: metadata.odo_start_miles ?? null,
        vehicle_id: metadata.vehicle?.id ?? null,
        gross_earnings: metadata.gross_earnings ?? 0,
        target_minutes: metadata.target_minutes ?? null,
        accumulated_pause_ms: computeAccumulatedPauseMs(state._benasSessionPauses),
        open_pause_started_at: openPause ? new Date(openPause.pause_start).getTime() : null,
    };
}

/**
 * Live elapsed active-work milliseconds for an 'active' or 'paused' view,
 * as of `now`. Returns null for 'loading' / 'unavailable' / 'none' -- there
 * is no elapsed time to derive when there is no session.
 *
 * APPROXIMATION, NOT A GUARANTEE, for the END-while-PAUSED case
 * (session-domain-multi-door-milestone.md, "Recorded debt" -- the
 * rpc_session_end pause-flooring entry, Fix 2). This function extrapolates
 * an open pause's duration live and unfloored; rpc_session_end floors that
 * same pause to the minute only once it actually closes (at RESUME, or
 * implicitly at END). A short open pause can therefore show as fully
 * excluded here while still counting as active time in the value
 * rpc_session_end eventually returns. A later step's END flow must use
 * that RPC's own returned active_duration as the final number, never a
 * value derived from this function.
 */
export function deriveElapsedActiveMs(view, now = Date.now()) {
    if (!view || (view.status !== 'active' && view.status !== 'paused')) return null;

    const start = new Date(view.start_time).getTime();
    let pausedMs = view.accumulated_pause_ms || 0;

    if (view.status === 'paused' && view.open_pause_started_at) {
        pausedMs += Math.max(0, now - view.open_pause_started_at);
    }

    return Math.max(0, now - start - pausedMs);
}
