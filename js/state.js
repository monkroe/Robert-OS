// ════════════════════════════════════════════════════════════════
// ROBERT OS - STATE.JS
// Versija: 1.2
// ════════════════════════════════════════════════════════════════

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
        if (!(key in target) && !key.startsWith('_')) {
            console.warn(`⚠️ Attempted to set unknown state property: ${key}`);
            return false;
        }
        
        const oldValue = target[key];
        target[key] = value;
        
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

export function onStateChange(key, callback) {
    window.addEventListener('state-updated', (event) => {
        if (event.detail.key === key) {
            callback(event.detail);
        }
    });
}

export function onAnyStateChange(callback) {
    window.addEventListener('state-updated', (event) => {
        callback(event.detail);
    });
}

export function debugState() {
    console.group('🔍 ROBERT OS State');
    console.log('User:', state.user?.email || 'Not logged in');
    console.log('Fleet:', state.fleet.length, 'vehicles');
    console.log('Active Shift:', state.activeShift ? 'Yes' : 'No');
    console.log('Settings:', state.userSettings ? 'Loaded' : 'Not loaded');
    console.log('Current Tab:', state.currentTab);
    console.log('Loading:', state.loading);
    console.groupEnd();
}

if (typeof window !== 'undefined') {
    window.debugState = debugState;
}
