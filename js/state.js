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
    _lastRefresh: null
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
