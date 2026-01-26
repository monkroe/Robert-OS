// ════════════════════════════════════════════════════════════════
// ROBERT OS — SETTINGS MODULE v1.7.0 (STABLE)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// DEFAULTS
// ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    timezone_primary: 'America/Chicago',
    timezone_secondary: 'Europe/Vilnius',
    clock_position: 'cockpit',
    monthly_fixed_expenses: 0,
    rental_week_start_day: 2, // Tuesday
    default_shift_target_hours: 12,
    notifications_enabled: true,
    compact_mode: false
};

// ────────────────────────────────────────────────────────────────
// LOAD & SYNC
// ────────────────────────────────────────────────────────────────

export async function loadSettings() {
    try {
        if (!state.user?.id) {
            console.warn('⚠️ loadSettings skipped: user not ready');
            return null;
        }

        const { data, error } = await db
            .from('user_settings')
            .select('*')
            .eq('user_id', state.user.id)
            .maybeSingle();

        if (error) throw error;

        // Jei nėra — sukuriam defaultus
        if (!data) {
            const created = await ensureDefaultSettings();
            state.userSettings = created;
            return created;
        }

        state.userSettings = data;
        return data;

    } catch (err) {
        console.error('❌ loadSettings failed:', err);
        return null; // NIEKADA nelaužom UI
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
        console.error('❌ Failed to create default settings:', error);
        throw error;
    }

    return data;
}

// ────────────────────────────────────────────────────────────────
// UI
// ────────────────────────────────────────────────────────────────

export async function openSettings() {
    vibrate();

    const settings = state.userSettings || await loadSettings();
    if (!settings) {
        showToast('Nepavyko užkrauti nustatymų', 'error');
        return;
    }

    setVal('settings-tz-primary', settings.timezone_primary);
    setVal('settings-tz-secondary', settings.timezone_secondary);
    setVal('settings-clock-pos', settings.clock_position);
    setVal('settings-fixed-expenses', settings.monthly_fixed_expenses);
    setVal('settings-rental-start-day', settings.rental_week_start_day);
    setVal('settings-shift-target', settings.default_shift_target_hours);

    setChecked('settings-notifications', settings.notifications_enabled);
    setChecked('settings-compact-mode', settings.compact_mode);

    window.openModal('settings-modal');
}

export async function saveSettings() {
    vibrate([20]);

    if (!state.user?.id) return;

    const updates = {
        timezone_primary: getVal('settings-tz-primary'),
        timezone_secondary: getVal('settings-tz-secondary'),
        clock_position: getVal('settings-clock-pos'),
        monthly_fixed_expenses: num('settings-fixed-expenses', 0),
        rental_week_start_day: num('settings-rental-start-day', 2),
        default_shift_target_hours: num('settings-shift-target', 12),
        notifications_enabled: isChecked('settings-notifications'),
        compact_mode: isChecked('settings-compact-mode'),
        updated_at: new Date().toISOString()
    };

    state.loading = true;

    try {
        const { error } = await db
            .from('user_settings')
            .update(updates)
            .eq('user_id', state.user.id);

        if (error) throw error;

        state.userSettings = {
            ...state.userSettings,
            ...updates
        };

        window.closeModals();
        showToast('Nustatymai išsaugoti ✅', 'success');

        window.dispatchEvent(new Event('refresh-data'));

    } catch (err) {
        console.error('❌ saveSettings failed:', err);
        showToast('Klaida saugant nustatymus', 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────────────────

function getVal(id) {
    return document.getElementById(id)?.value ?? '';
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el != null) el.value = val;
}

function num(id, fallback = 0) {
    const n = parseFloat(getVal(id));
    return Number.isFinite(n) ? n : fallback;
}

function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

function isChecked(id) {
    return document.getElementById(id)?.checked === true;
}
