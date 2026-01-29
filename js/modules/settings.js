// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SETTINGS.JS v2.0.0
// Purpose: Load/save user preferences (DB + localStorage) with schema-safe timezone fields
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals, applyTheme, startClocks } from './ui.js';

// ────────────────────────────────────────────────────────────────
// SCHEMA-SAFE DEFAULTS (match DB columns)
// ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    timezone_primary: 'America/Chicago',
    timezone_secondary: 'Europe/Vilnius',

    // UI/UX
    clock_position: 'header', // header | cockpit | both | hidden
    theme: 'auto',            // auto | dark | light
    compact_mode: false,
    notifications: false,

    // Finance/Work
    monthly_fixed_expenses: 0,
    rental_week_start_day: 2,        // Tuesday
    default_shift_target_hours: 12
};

// Keys used for client-only persistence (avoids DB headaches if schema changes)
const LS_KEYS = {
    tzPrimary: 'timezone_primary',
    tzSecondary: 'timezone_secondary',
    clockPos: 'clock_position',
    theme: 'theme',
    compact: 'compact_mode',
    notif: 'notifications',
    fixed: 'monthly_fixed_expenses',
    rentalStart: 'rental_week_start_day',
    shiftTarget: 'default_shift_target_hours'
};

// ────────────────────────────────────────────────────────────────
// LOAD
// ────────────────────────────────────────────────────────────────

export async function loadSettings() {
    if (!state.user?.id) return null;

    // Start from defaults, then localStorage, then DB (DB wins)
    const base = applyLocalStorageToDefaults({ ...DEFAULT_SETTINGS });

    try {
        const { data, error } = await db
            .from('user_settings')
            .select('*')
            .eq('user_id', state.user.id)
            .maybeSingle();

        if (error) throw error;

        // If no DB row, ensure defaults exist (and persist)
        if (!data) {
            const created = await ensureDefaultSettings(base);
            state.userSettings = created;
            persistSettingsToLocalStorage(created);
            return created;
        }

        // Merge DB onto base (DB overrides local)
        const merged = { ...base, ...sanitizeSettingsFromDb(data) };
        state.userSettings = merged;
        persistSettingsToLocalStorage(merged);
        return merged;

    } catch (err) {
        // Fallback: localStorage + defaults only (no DB)
        state.userSettings = base;
        return base;
    }
}

async function ensureDefaultSettings(payload) {
    const upsertPayload = {
        user_id: state.user.id,
        ...payload,
        updated_at: new Date().toISOString()
    };

    const { data, error } = await db
        .from('user_settings')
        .upsert(upsertPayload, { onConflict: 'user_id' })
        .select()
        .single();

    if (error) {
        // If upsert fails, still return payload (client works)
        return payload;
    }
    return data || payload;
}

// ────────────────────────────────────────────────────────────────
// UI OPEN/SAVE
// ────────────────────────────────────────────────────────────────

export async function openSettings() {
    vibrate([10]);

    const settings = state.userSettings || await loadSettings();

    // Timezones
    setVal('settings-tz-primary', settings.timezone_primary);

    // Optional (if your modal has these fields)
    setVal('settings-tz-secondary', settings.timezone_secondary);
    setVal('settings-clock-pos', settings.clock_position);
    setVal('settings-fixed-expenses', settings.monthly_fixed_expenses);
    setVal('settings-rental-start-day', settings.rental_week_start_day);
    setVal('settings-shift-target', settings.default_shift_target_hours);

    setChecked('settings-notifications', !!settings.notifications);
    setChecked('settings-compact-mode', !!settings.compact_mode);

    openModal('settings-modal');
}

export async function saveSettings() {
    vibrate([20]);
    if (!state.user?.id) return;

    state.loading = true;

    try {
        const current = state.userSettings || { ...DEFAULT_SETTINGS };

        // Read from DOM if present; otherwise keep current
        const updates = {
            timezone_primary: getValOrKeep('settings-tz-primary', current.timezone_primary),
            timezone_secondary: getValOrKeep('settings-tz-secondary', current.timezone_secondary),
            clock_position: getValOrKeep('settings-clock-pos', current.clock_position),

            monthly_fixed_expenses: toNumber(getValOrKeep('settings-fixed-expenses', current.monthly_fixed_expenses)),
            rental_week_start_day: toInt(getValOrKeep('settings-rental-start-day', current.rental_week_start_day)),
            default_shift_target_hours: toNumber(getValOrKeep('settings-shift-target', current.default_shift_target_hours)),

            notifications: getCheckedOrKeep('settings-notifications', current.notifications),
            compact_mode: getCheckedOrKeep('settings-compact-mode', current.compact_mode),

            // Theme is managed by ui.js (cycleTheme), but we store it too
            theme: (localStorage.getItem(LS_KEYS.theme) || current.theme || 'auto'),

            updated_at: new Date().toISOString()
        };

        // Persist to DB (schema-safe columns)
        const { error } = await db
            .from('user_settings')
            .update(updates)
            .eq('user_id', state.user.id);

        if (error) throw error;

        // Update runtime + localStorage
        state.userSettings = { ...current, ...updates };
        persistSettingsToLocalStorage(state.userSettings);

        // Apply runtime effects immediately
        applyTheme?.();
        startClocks?.();

        closeModals();
        showToast('SETTINGS SAVED', 'success');
        window.dispatchEvent(new Event('refresh-data'));

    } catch (err) {
        showToast(err.message || 'Save failed', 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// LOCALSTORAGE HELPERS
// ────────────────────────────────────────────────────────────────

function applyLocalStorageToDefaults(obj) {
    const out = { ...obj };

    const tzP = localStorage.getItem(LS_KEYS.tzPrimary);
    const tzS = localStorage.getItem(LS_KEYS.tzSecondary);
    const pos = localStorage.getItem(LS_KEYS.clockPos);
    const theme = localStorage.getItem(LS_KEYS.theme);

    if (tzP) out.timezone_primary = tzP;
    if (tzS) out.timezone_secondary = tzS;
    if (pos) out.clock_position = pos;
    if (theme) out.theme = theme;

    // Optional numeric/bool persisted
    const fixed = localStorage.getItem(LS_KEYS.fixed);
    const rental = localStorage.getItem(LS_KEYS.rentalStart);
    const target = localStorage.getItem(LS_KEYS.shiftTarget);
    const compact = localStorage.getItem(LS_KEYS.compact);
    const notif = localStorage.getItem(LS_KEYS.notif);

    if (fixed !== null) out.monthly_fixed_expenses = toNumber(fixed);
    if (rental !== null) out.rental_week_start_day = toInt(rental);
    if (target !== null) out.default_shift_target_hours = toNumber(target);
    if (compact !== null) out.compact_mode = compact === 'true';
    if (notif !== null) out.notifications = notif === 'true';

    return out;
}

function persistSettingsToLocalStorage(s) {
    if (!s) return;
    localStorage.setItem(LS_KEYS.tzPrimary, s.timezone_primary || DEFAULT_SETTINGS.timezone_primary);
    localStorage.setItem(LS_KEYS.tzSecondary, s.timezone_secondary || DEFAULT_SETTINGS.timezone_secondary);
    localStorage.setItem(LS_KEYS.clockPos, s.clock_position || DEFAULT_SETTINGS.clock_position);

    if (typeof s.monthly_fixed_expenses !== 'undefined') localStorage.setItem(LS_KEYS.fixed, String(s.monthly_fixed_expenses));
    if (typeof s.rental_week_start_day !== 'undefined') localStorage.setItem(LS_KEYS.rentalStart, String(s.rental_week_start_day));
    if (typeof s.default_shift_target_hours !== 'undefined') localStorage.setItem(LS_KEYS.shiftTarget, String(s.default_shift_target_hours));
    if (typeof s.compact_mode !== 'undefined') localStorage.setItem(LS_KEYS.compact, String(!!s.compact_mode));
    if (typeof s.notifications !== 'undefined') localStorage.setItem(LS_KEYS.notif, String(!!s.notifications));

    // Theme is stored by ui.js, but keep consistent
    if (s.theme) localStorage.setItem(LS_KEYS.theme, s.theme);
}

// Only keep known keys from DB (prevents old columns like "timezone" from leaking back)
function sanitizeSettingsFromDb(data) {
    const cleaned = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof data[k] !== 'undefined') cleaned[k] = data[k];
    }
    return cleaned;
}

// ────────────────────────────────────────────────────────────────
// SMALL DOM UTILS
// ────────────────────────────────────────────────────────────────

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

function setChecked(id, boolVal) {
    const el = document.getElementById(id);
    if (el && el.type === 'checkbox') el.checked = !!boolVal;
}

function getValOrKeep(id, fallback) {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
}

function getCheckedOrKeep(id, fallback) {
    const el = document.getElementById(id);
    if (!el || el.type !== 'checkbox') return !!fallback;
    return !!el.checked;
}

function toNumber(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
}

function toInt(v) {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : 0;
}
