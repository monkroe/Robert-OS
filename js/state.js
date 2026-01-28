// ════════════════════════════════════════════════════════════════
// ROBERT OS - STATE.JS v2.0.0
// Logic: Reactive State Proxy & Global Data Integrity
// ════════════════════════════════════════════════════════════════

export const state = new Proxy({
    // Auth & User
    user: null,
    userSettings: null,
    
    // Fleet & Shift
    fleet: [],
    activeShift: null,
    
    // UI Engine
    loading: false,
    currentTab: 'cockpit',
    
    // Internal Flags
    _initialized: false,
    _lastSync: null
    
}, {
    set(target, key, value) {
        // Apsauga: Neleidžiame kurti naujų savybių "on the fly", kurios nėra aprašytos aukščiau
        if (!(key in target) && !key.startsWith('_')) {
            console.error(`🚨 OS STATE ERROR: Property "${key}" is not defined in core schema.`);
            return false;
        }
        
        const oldValue = target[key];
        target[key] = value;
        
        // Dispečerizuojame įvykį tik jei reikšmė tikrai pasikeitė (Performance)
        if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
            window.dispatchEvent(new CustomEvent('state-updated', { 
                detail: { key, oldValue, newValue: value } 
            }));
        }
        
        return true;
    },
    
    get(target, key) {
        return target[key];
    }
});

/* ────────────────────────────────────────────────────────────────
   HELPERS (Source of Truth for other modules)
---------------------------------------------------------------- */

export const isAuthenticated = () => state.user !== null;

export const hasActiveShift = () => state.activeShift !== null;

/**
 * Grąžina aktyvų automobilį iš laivyno pagal aktyvią pamainą.
 * Naudojama shifts.js ir finance.js moduliuose.
 */
export function getActiveVehicle() {
    if (!state.activeShift || !state.fleet.length) return null;
    return state.fleet.find(v => v.id === state.activeShift.vehicle_id) || null;
}

/**
 * Stebi specifinį būsenos pasikeitimą (pvz. loading indikatorių).
 */
export function onStateChange(key, callback) {
    window.addEventListener('state-updated', (event) => {
        if (event.detail.key === key) {
            callback(event.detail.newValue, event.detail.oldValue);
        }
    });
}

/* ────────────────────────────────────────────────────────────────
   DEBUGGING (Production-Safe)
---------------------------------------------------------------- */

export function debugState() {
    console.group('%c🔍 ROBERT OS SYSTEM STATE', 'color: #14b8a6; font-weight: bold;');
    console.log('👤 USER:', state.user?.email || 'OFFLINE');
    console.log('🚗 FLEET:', state.fleet.length, 'vehicles');
    console.log('⏱️ SHIFT:', state.activeShift ? `ACTIVE (${state.activeShift.status})` : 'NO ACTIVE SHIFT');
    console.log('⚙️ SETTINGS:', state.userSettings ? 'LOADED' : 'MISSING');
    console.log('📱 TAB:', state.currentTab.toUpperCase());
    console.log('⏳ LOADING:', state.loading ? 'YES' : 'NO');
    console.groupEnd();
}

// Tikriname ar window egzistuoja (suderinamumas su kai kuriais testavimo įrankiais)
if (typeof window !== 'undefined') {
    window.debugState = debugState;
}
