// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SETTINGS.JS v2.1.0
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
    timezone: 'America/Chicago',
    timezone_secondary: 'Europe/Vilnius',
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
            // Auto-create defaults if missing
            return await ensureDefaultSettings();
        }

        state.userSettings = data;
        return data;

    } catch (err) {
        console.error('Settings Sync Error:', err);
        // Fallback to defaults in memory only, don't crash
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

    const { data, error } = await db
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

    if (error) {
        console.error('Defaults Creation Failed:', error);
        return DEFAULT_SETTINGS;
    }

    state.userSettings = data;
    return data;
}

// ────────────────────────────────────────────────────────────────
// UI INTERACTION
// ────────────────────────────────────────────────────────────────

export async function openSettings() {
    vibrate([10]);

    // Ensure we have latest data
    const settings = state.userSettings || await loadSettings();
    
    // Map data to UI Inputs
    // Naudojame 'settings-tz-primary' nes taip pavadinta jūsų index.html
    setVal('settings-tz-primary', settings.timezone);
    
    // Kiti laukai (jei ateityje pridėsite į HTML)
    setVal('settings-tz-secondary', settings.timezone_secondary);
    setVal('settings-fixed-expenses', settings.monthly_fixed_expenses);
    setVal('settings-rental-start-day', settings.rental_week_start_day);
    setVal('settings-shift-target', settings.default_shift_target_hours);
    
    openModal('settings-modal');
}

export async function saveSettings() {
    vibrate([20]);
    if (!state.user?.id) return;

    state.loading = true;

    try {
        const current = state.userSettings || DEFAULT_SETTINGS;

        // SMART UPDATE: Atnaujiname tik tai, ką radome DOM'e.
        // Jei HTML elementas neegzistuoja, paliekame seną reikšmę.
        const updates = {
            timezone: getValOrKeep('settings-tz-primary', current.timezone),
            timezone_secondary: getValOrKeep('settings-tz-secondary', current.timezone_secondary),
            monthly_fixed_expenses: getNumOrKeep('settings-fixed-expenses', current.monthly_fixed_expenses),
            rental_week_start_day: getNumOrKeep('settings-rental-start-day', current.rental_week_start_day),
            default_shift_target_hours: getNumOrKeep('settings-shift-target', current.default_shift_target_hours),
            updated_at: new Date().toISOString()
        };

        const { error } = await db
            .from('user_settings')
            .update(updates)
            .eq('user_id', state.user.id);

        if (error) throw error;

        // Update local state immediately
        state.userSettings = { ...state.userSettings, ...updates };

        closeModals();
        showToast('NUSTATYMAI IŠSAUGOTI', 'success');

        // Refresh UI components that depend on settings (Clock, Costs)
        window.dispatchEvent(new Event('refresh-data'));

    } catch (err) {
        showToast('KLAIDA: ' + err.message, 'error');
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

// Grąžina input reikšmę. Jei inputo nėra DOM'e - grąžina seną reikšmę (fallback).
function getValOrKeep(id, fallback) {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
}

// Tas pats, tik skaičiams
function getNumOrKeep(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const val = parseFloat(el.value);
    return isNaN(val) ? fallback : val;
}
