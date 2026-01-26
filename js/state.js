// ════════════════════════════════════════════════════════════════
// ROBERT OS - STATE.JS v1.7.2 (SIMPLE)
// Global Application State
// ════════════════════════════════════════════════════════════════

export const state = {
    // Auth
    user: null,
    
    // Settings
    userSettings: null,
    
    // Fleet
    fleet: [],
    
    // Active Shift
    activeShift: null,
    
    // UI State
    currentTab: 'cockpit',
    loading: false,
    
    // Transaction Direction
    txDirection: 'in',
    
    // ✅ VALIDATION HELPERS
    get isAuthenticated() {
        return !!this.user;
    },
    
    get hasActiveShift() {
        return !!this.activeShift && this.activeShift.status === 'active';
    },
    
    get isShiftPaused() {
        return !!this.activeShift && !!this.activeShift.paused_at;
    },
    
    get activeVehicle() {
        if (!this.activeShift || !this.fleet) return null;
        return this.fleet.find(v => v.id === this.activeShift.vehicle_id);
    }
};

// ────────────────────────────────────────────────────────────────
// DEBUG HELPERS
// ────────────────────────────────────────────────────────────────

export function debugState() {
    console.group('🔍 ROBERT OS State v1.7.2');
    console.log('User:', state.user?.email || 'Not logged in');
    console.log('Fleet:', state.fleet?.length || 0, 'vehicles');
    console.log('Active Shift:', state.activeShift ? 'Yes' : 'No');
    console.log('Settings:', state.userSettings ? 'Loaded' : 'Not loaded');
    console.log('Current Tab:', state.currentTab);
    console.log('Loading:', state.loading);
    console.groupEnd();
}

// Global exposure for debugging
if (typeof window !== 'undefined') {
    window.debugState = debugState;
}
