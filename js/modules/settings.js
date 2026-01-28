// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SETTINGS.JS v2.1.2
// Logic: User Preferences & Persistence
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

// ────────────────────────────────────────────────────────────────
// DEFAULTS
// ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    timezone: 'America/Chicago',           // Primary (Header)
    timezone_secondary: 'America/Chicago', // Secondary (Local/Bento) - FIX: Chicago
    monthly_fixed_expenses: 0,
    rental_week_start_day: 2, // Tuesday
    default_shift_target_hours: 12,
    compact_mode: false
};

// ────────────────────────────────────────────────────────────────
// SYNC ENGINE
// ────────────────────────────────────────────────────────────────

export async function loadSettings() {
    if (!state.user?.id) return null;

    try {
        const { data, error } = await db
            .from('user_settings')
            .select('*')
            .eq('user_id', state.user.id)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return await ensureDefaultSettings();
        }

        state.userSettings = data;
        return data;

    } catch (err) {
        console.error('Settings Sync Error:', err);
        state.userSettings = { ...DEFAULT_SETTINGS }; 
        return state.userSettings;
    }
}

async function ensureDefaultSettings() {
    const payload = {
        user_id: state.user.id,
        ...DEFAULT_SETTINGS,
        updated_at: new Date().toISOString()
    };

    const { data } = await db
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

    state.userSettings = data || DEFAULT_SETTINGS;
    return state.userSettings;
}

// ────────────────────────────────────────────────────────────────
// UI INTERACTION
// ────────────────────────────────────────────────────────────────

export async function openSettings() {
    vibrate([10]);
    const settings = state.userSettings || await loadSettings();
    
    setVal('settings-tz-primary', settings.timezone);
    // Jei ateityje pridėsite antrinį pasirinkimą į HTML:
    setVal('settings-tz-secondary', settings.timezone_secondary);
    
    openModal('settings-modal');
}

export async function saveSettings() {
    vibrate([20]);
    if (!state.user?.id) return;

    state.loading = true;

    try {
        const current = state.userSettings || DEFAULT_SETTINGS;

        const updates = {
            timezone: getValOrKeep('settings-tz-primary', current.timezone),
            // Užtikriname, kad Local laikas visada būtų Čikaga, jei nėra pasirinkimo
            timezone_secondary: getValOrKeep('settings-tz-secondary', 'America/Chicago'),
            monthly_fixed_expenses: getNumOrKeep('settings-fixed-expenses', current.monthly_fixed_expenses),
            updated_at: new Date().toISOString()
        };

        const { error } = await db
            .from('user_settings')
            .update(updates)
            .eq('user_id', state.user.id);

        if (error) throw error;

        state.userSettings = { ...state.userSettings, ...updates };

        closeModals();
        showToast('NUSTATYMAI IŠSAUGOTI', 'success');
        window.dispatchEvent(new Event('refresh-data'));

    } catch (err) {
        showToast('Klaida: ' + err.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

function getValOrKeep(id, fallback) {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
}

function getNumOrKeep(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const val = parseFloat(el.value);
    return isNaN(val) ? fallback : val;
}
