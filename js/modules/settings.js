// ════════════════════════════════════════════════════════════════
// ROBERT OS - SETTINGS MODULE v1.6.0 (FINAL)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// LOAD & SYNC
// ────────────────────────────────────────────────────────────────

export async function loadSettings() {
    try {
        const { data, error } = await db
            .from('user_settings')
            .select('*')
            .eq('user_id', state.user.id)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        if (!data) {
            await createDefaultSettings();
            return await loadSettings();
        }
        
        state.userSettings = data;
        return data;
        
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Nepavyko užkrauti nustatymų', 'error');
        return null;
    }
}

async function createDefaultSettings() {
    try {
        const { error } = await db
            .from('user_settings')
            .insert({
                user_id: state.user.id,
                timezone_primary: 'America/Chicago',
                timezone_secondary: 'Europe/Vilnius',
                clock_position: 'cockpit',
                monthly_fixed_expenses: 0,
                rental_week_start_day: 2,
                default_shift_target_hours: 12,
                notifications_enabled: true,
                compact_mode: false
            });
        
        if (error) throw error;
    } catch (error) {
        console.error('Error creating defaults:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// UI INTERACTIONS
// ────────────────────────────────────────────────────────────────

export async function openSettings() {
    vibrate();
    
    const settings = state.userSettings || await loadSettings();
    if (!settings) return;
    
    setVal('settings-tz-primary', settings.timezone_primary || 'America/Chicago');
    setVal('settings-tz-secondary', settings.timezone_secondary || 'Europe/Vilnius');
    setVal('settings-clock-pos', settings.clock_position || 'cockpit');
    setVal('settings-fixed-expenses', settings.monthly_fixed_expenses || 0);
    setVal('settings-rental-start-day', settings.rental_week_start_day || 2);
    setVal('settings-shift-target', settings.default_shift_target_hours || 12);
    
    const notifEl = document.getElementById('settings-notifications');
    if (notifEl) notifEl.checked = settings.notifications_enabled !== false;
    
    const compactEl = document.getElementById('settings-compact-mode');
    if (compactEl) compactEl.checked = settings.compact_mode === true;
    
    window.openModal('settings-modal');
}

export async function saveSettings() {
    vibrate([20]);
    
    const updates = {
        timezone_primary: getVal('settings-tz-primary'),
        timezone_secondary: getVal('settings-tz-secondary'),
        clock_position: getVal('settings-clock-pos'),
        monthly_fixed_expenses: parseFloat(getVal('settings-fixed-expenses')) || 0,
        rental_week_start_day: parseInt(getVal('settings-rental-start-day')) || 2,
        default_shift_target_hours: parseFloat(getVal('settings-shift-target')) || 12,
        notifications_enabled: document.getElementById('settings-notifications')?.checked || false,
        compact_mode: document.getElementById('settings-compact-mode')?.checked || false,
        updated_at: new Date().toISOString()
    };
    
    state.loading = true;
    try {
        const { error } = await db
            .from('user_settings')
            .update(updates)
            .eq('user_id', state.user.id);
            
        if (error) throw error;
        
        state.userSettings = { ...state.userSettings, ...updates };
        
        window.closeModals();
        showToast('Nustatymai išsaugoti ✅', 'success');
        
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (error) {
        console.error('Settings save error:', error);
        showToast('Klaida saugant nustatymus', 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────────────────

function getVal(id) {
    return document.getElementById(id)?.value;
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}
