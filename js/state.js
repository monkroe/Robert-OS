// ════════════════════════════════════════════════════════════════
// ROBERT OS - STATE.JS v2.0.0
// Purpose: Central runtime state + reactive updates via Proxy
// ════════════════════════════════════════════════════════════════

const INITIAL_STATE = {
    // Auth
    user: null,

    // Data
    fleet: [],
    activeShift: null,
    userSettings: null,

    // UI
    loading: false,
    currentTab: 'cockpit',

    // Optional legacy / compatibility (safe to keep even if unused)
    txDirection: 'in',

    // Internal (allowed because starts with "_")
    _lastRefresh: null,

    // Session Domain Multi-Door milestone, step 3 (Realtime subscription
    // only): the canonical work_sessions row from the Benas project,
    // refetched on every Realtime event. Deliberately NOT state.activeShift
    // -- that field is read in shift-record shape (finance_shifts) by
    // shifts.js/costs.js/finance.js/ui.js, and work_sessions has a different
    // shape (money lives inside `metadata`, not flat columns). This field
    // stays unread by the rest of the app until the milestone's read-path
    // switch step; for now it exists so the value can be observed/logged.
    _benasSessionPreview: null,

    // Full session_pauses history (closed rows included) for the session in
    // _benasSessionPreview, same refetch. Needed later to compute
    // accumulated pause time with the same per-pause floor-to-minute rule
    // rpc_session_end applies server-side (session-domain-multi-door-milestone.md,
    // "Recorded debt" -- the rpc_session_end pause-flooring entry). Not read
    // by anything yet.
    _benasSessionPauses: [],

    // The one OPEN row (pause_end IS NULL) from _benasSessionPauses, or null
    // if there is none. Derived by session-sync.js at fetch time so nothing
    // else has to re-scan the array to answer "is this session paused".
    _benasOpenPause: null,

    // Deterministic canonical readiness -- 'loading' | 'ready' | 'unavailable'.
    // 'loading' until the first bootstrap/fetch resolves one way or the
    // other; 'ready' means _benasSessionPreview is trustworthy (null = no
    // active session, confirmed, not unknown); 'unavailable' means the last
    // attempt to reach canonical truth failed (bootstrap never happened, or
    // a fetch errored). Deliberately three states, not a boolean: a future
    // consumer must be able to disable session controls for BOTH 'loading'
    // and 'unavailable' while still telling them apart, because only the
    // second is an error worth surfacing. Session Domain Multi-Door
    // milestone, "no runtime legacy fallback after cutover" fix -- state.activeShift
    // is never touched by this field or by anything that sets it.
    _benasCanonicalStatus: 'loading',

    // Last error message behind a 'unavailable' _benasCanonicalStatus, or
    // null. Only meaningful when _benasCanonicalStatus === 'unavailable'.
    _benasCanonicalError: null
};

function cloneInitial() {
    return JSON.parse(JSON.stringify(INITIAL_STATE));
}

export const state = new Proxy(cloneInitial(), {
    set(target, key, value) {
        // Guard: prevent silent typos that create new props
        if (!(key in target) && !String(key).startsWith('_')) {
            console.warn(`⚠️ Attempted to set unknown state property: ${String(key)}`);
            return false;
        }

        const oldValue = target[key];
        target[key] = value;

        if (oldValue !== value && typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('state-updated', {
                    detail: { key, oldValue, newValue: value }
                })
            );
        }

        return true;
    },

    get(target, key) {
        return target[key];
    }
});

// ────────────────────────────────────────────────────────────────
// Helpers (optional but useful)
// ────────────────────────────────────────────────────────────────

export function resetState() {
    const fresh = cloneInitial();
    Object.keys(fresh).forEach((k) => {
        state[k] = fresh[k];
    });
}

export function isAuthenticated() {
    return state.user !== null;
}

export function hasActiveShift() {
    return state.activeShift !== null;
}

export function getShiftStatus() {
    return state.activeShift?.status ?? null;
}

export function isShiftPaused() {
    return getShiftStatus() === 'paused';
}

export function getActiveVehicle() {
    if (!state.activeShift || !state.fleet?.length) return null;
    return state.fleet.find(v => v.id === state.activeShift.vehicle_id) || null;
}

export function hasSettings() {
    return state.userSettings !== null;
}

export function onStateChange(key, callback) {
    window.addEventListener('state-updated', (event) => {
        if (event.detail.key === key) callback(event.detail);
    });
}

export function onAnyStateChange(callback) {
    window.addEventListener('state-updated', (event) => callback(event.detail));
}

export function debugState() {
    console.group('🔍 ROBERT OS State');
    console.log('User:', state.user?.email || 'Not logged in');
    console.log('Fleet:', state.fleet?.length || 0, 'vehicles');
    console.log('Active Shift:', state.activeShift ? 'Yes' : 'No');
    console.log('Settings:', state.userSettings ? 'Loaded' : 'Not loaded');
    console.log('Current Tab:', state.currentTab);
    console.log('Loading:', state.loading);
    console.groupEnd();
}

if (typeof window !== 'undefined') {
    window.debugState = debugState;
}
