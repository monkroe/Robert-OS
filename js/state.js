// ════════════════════════════════════════════════════════════════
// ROBERT OS - STATE.JS v1.5.0
// Reactive State Management with Memory Leak Prevention
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// LISTENER TRACKING (Memory Leak Prevention)
// ────────────────────────────────────────────────────────────────

const listeners = new Map();

// ────────────────────────────────────────────────────────────────
// REACTIVE STATE PROXY
// ────────────────────────────────────────────────────────────────

export const state = new Proxy({
    user: null,
    fleet: [],
    activeShift: null,
    userSettings: null,
    
    txDirection: 'in',
    loading: false,
    currentTab: 'cockpit',
    
    _lastRefresh: null
    
}, {
    set(target, key, value) {
        // Prevent setting unknown properties
        if (!(key in target) && !key.startsWith('_')) {
            console.warn(`⚠️ Attempted to set unknown state property: ${key}`);
            return false;
        }
        
        const oldValue = target[key];
        target[key] = value;
        
        // Trigger state-updated event only if value changed
        if (oldValue !== value) {
            window.dispatchEvent(new CustomEvent('state-updated', { 
                detail: { 
                    key, 
                    oldValue, 
                    newValue: value 
                } 
            }));
        }
        
        return true;
    },
    
    get(target, key) {
        return target[key];
    }
});

// ────────────────────────────────────────────────────────────────
// STATE HELPERS
// ────────────────────────────────────────────────────────────────

export function isAuthenticated() {
    return state.user !== null;
}

export function hasActiveShift() {
    return state.activeShift !== null;
}

export function getShiftStatus() {
    if (!state.activeShift) return null;
    return state.activeShift.status;
}

export function isShiftPaused() {
    return getShiftStatus() === 'paused';
}

export function getActiveVehicle() {
    if (!state.activeShift || !state.fleet) return null;
    return state.fleet.find(v => v.id === state.activeShift.vehicle_id);
}

export function hasSettings() {
    return state.userSettings !== null;
}

// ────────────────────────────────────────────────────────────────
// STATE CHANGE LISTENERS (With Cleanup Support)
// ────────────────────────────────────────────────────────────────

export function onStateChange(key, callback) {
    const handler = (event) => {
        if (event.detail.key === key) {
            callback(event.detail);
        }
    };
    
    window.addEventListener('state-updated', handler);
    
    // Track listener for cleanup
    if (!listeners.has(key)) {
        listeners.set(key, []);
    }
    listeners.get(key).push(handler);
    
    // Return cleanup function
    return () => {
        window.removeEventListener('state-updated', handler);
        const keyListeners = listeners.get(key);
        if (keyListeners) {
            const index = keyListeners.indexOf(handler);
            if (index > -1) keyListeners.splice(index, 1);
        }
    };
}

export function onAnyStateChange(callback) {
    const handler = (event) => {
        callback(event.detail);
    };
    
    window.addEventListener('state-updated', handler);
    
    // Track listener
    if (!listeners.has('*')) {
        listeners.set('*', []);
    }
    listeners.get('*').push(handler);
    
    // Return cleanup function
    return () => {
        window.removeEventListener('state-updated', handler);
        const allListeners = listeners.get('*');
        if (allListeners) {
            const index = allListeners.indexOf(handler);
            if (index > -1) allListeners.splice(index, 1);
        }
    };
}

// ────────────────────────────────────────────────────────────────
// CLEANUP (Called on logout)
// ────────────────────────────────────────────────────────────────

export function cleanupStateListeners() {
    let totalCleaned = 0;
    
    for (const [key, handlers] of listeners) {
        handlers.forEach(handler => {
            window.removeEventListener('state-updated', handler);
            totalCleaned++;
        });
    }
    
    listeners.clear();
    
    console.log(`🧹 Cleaned up ${totalCleaned} state listeners`);
}

// ────────────────────────────────────────────────────────────────
// DEBUG HELPERS
// ────────────────────────────────────────────────────────────────

export function debugState() {
    console.group('🔍 ROBERT OS State v1.5.0');
    console.log('User:', state.user?.email || 'Not logged in');
    console.log('Fleet:', state.fleet.length, 'vehicles');
    console.log('Active Shift:', state.activeShift ? 'Yes' : 'No');
    console.log('Settings:', state.userSettings ? 'Loaded' : 'Not loaded');
    console.log('Current Tab:', state.currentTab);
    console.log('Loading:', state.loading);
    console.log('Active Listeners:', Array.from(listeners.entries()).map(([k, v]) => `${k}: ${v.length}`));
    console.groupEnd();
}

export function getListenerCount() {
    let total = 0;
    for (const handlers of listeners.values()) {
        total += handlers.length;
    }
    return total;
}

// ────────────────────────────────────────────────────────────────
// GLOBAL EXPOSURE (For debugging)
// ────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.debugState = debugState;
    window.getListenerCount = getListenerCount;
    window.cleanupStateListeners = cleanupStateListeners;
}
