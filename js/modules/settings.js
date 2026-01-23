// ════════════════════════════════════════════════════════════════
// ROBERT OS - SETTINGS MODULE
// Versija: 1.2
// 
// ATSAKOMYBĖ: Vartotojo nustatymų valdymas
// Laiko zonos, finansai, UI nuostatos, plovykla
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';

// ────────────────────────────────────────────────────────────────
// 1. UŽKRAUTI NUSTATYMUS (iš DB)
// ────────────────────────────────────────────────────────────────

export async function loadSettings() {
    try {
        const { data, error } = await db
            .from('user_settings')
            .select('*')
            .eq('user_id', state.user.id)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
            // PGRST116 = "not found" - tai normalu pirmam kartui
            throw error;
        }
        
        // Jei nėra settings - sukuriame default'us
        if (!data) {
            await createDefaultSettings();
            return await loadSettings(); // Rekursija: užkrauname naujai sukurtus
        }
        
        // Išsaugome state (cache)
        state.userSettings = data;
        
        return data;
        
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Nepavyko užkrauti nustatymų', 'error');
        return null;
    }
}

// ────────────────────────────────────────────────────────────────
// 2. SUKURTI DEFAULT NUSTATYMUS
// ────────────────────────────────────────────────────────────────

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
                weekly_rental_cost: 0,
                rental_week_start_day: 2, // Tuesday
                default_shift_target_hours: 12,
                notifications_enabled: true,
                compact_mode: false
            });
        
        if (error) throw error;
        
    } catch (error) {
        console.error('Error creating default settings:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// 3. ATNAUJINTI NUSTATYMUS
// ────────────────────────────────────────────────────────────────

export async function updateSettings(updates) {
    try {
        const { error } = await db
            .from('user_settings')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', state.user.id);
        
        if (error) throw error;
        
        // Atnaujinti state
        state.userSettings = { ...state.userSettings, ...updates };
        
        showToast('Nustatymai išsaugoti', 'success');
        
        return true;
        
    } catch (error) {
        console.error('Error updating settings:', error);
        showToast('Nepavyko išsaugoti', 'error');
        return false;
    }
}

// ────────────────────────────────────────────────────────────────
// 4. SETTINGS MODAL - ATIDARYTI
// ────────────────────────────────────────────────────────────────

export async function openSettings() {
    vibrate();
    
    // Užkrauti settings iš DB
    const settings = await loadSettings();
    
    if (!settings) return;
    
    // Užpildyti formą
    document.getElementById('settings-tz-primary').value = settings.timezone_primary || 'America/Chicago';
    document.getElementById('settings-tz-secondary').value = settings.timezone_secondary || 'Europe/Vilnius';
    document.getElementById('settings-clock-pos').value = settings.clock_position || 'cockpit';
    
    document.getElementById('settings-fixed-expenses').value = settings.monthly_fixed_expenses || 0;
    document.getElementById('settings-rental-cost').value = settings.weekly_rental_cost || 0;
    document.getElementById('settings-rental-start-day').value = settings.rental_week_start_day || 2;
    
    document.getElementById('settings-shift-target').value = settings.default_shift_target_hours || 12;
    document.getElementById('settings-notifications').checked = settings.notifications_enabled !== false;
    document.getElementById('settings-compact-mode').checked = settings.compact_mode === true;
    
    // Atidaryti modalą
    document.getElementById('settings-modal').classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// 5. SETTINGS MODAL - IŠSAUGOTI
// ────────────────────────────────────────────────────────────────

export async function saveSettings() {
    vibrate([20]);
    
    const updates = {
        timezone_primary: document.getElementById('settings-tz-primary').value,
        timezone_secondary: document.getElementById('settings-tz-secondary').value,
        clock_position: document.getElementById('settings-clock-pos').value,
        
        monthly_fixed_expenses: parseFloat(document.getElementById('settings-fixed-expenses').value) || 0,
        weekly_rental_cost: parseFloat(document.getElementById('settings-rental-cost').value) || 0,
        rental_week_start_day: parseInt(document.getElementById('settings-rental-start-day').value) || 2,
        
        default_shift_target_hours: parseFloat(document.getElementById('settings-shift-target').value) || 12,
        notifications_enabled: document.getElementById('settings-notifications').checked,
        compact_mode: document.getElementById('settings-compact-mode').checked
    };
    
    const success = await updateSettings(updates);
    
    if (success) {
        closeModals();
        
        // Perkrauti UI su naujais nustatymais
        window.dispatchEvent(new Event('refresh-data'));
    }
}

// ────────────────────────────────────────────────────────────────
// 6. CAR WASH MEMBERSHIP - VALDYMAS
// ────────────────────────────────────────────────────────────────

export async function loadCarWashMembership() {
    try {
        const { data, error } = await db
            .from('car_wash_memberships')
            .select('*')
            .eq('user_id', state.user.id)
            .eq('is_active', true)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        return data;
        
    } catch (error) {
        console.error('Error loading car wash membership:', error);
        return null;
    }
}

export async function saveCarWashMembership(name, monthlyCost, startDate) {
    try {
        // Deaktyvuoti seną membership (jei yra)
        await db
            .from('car_wash_memberships')
            .update({ is_active: false })
            .eq('user_id', state.user.id)
            .eq('is_active', true);
        
        // Sukurti naują
        const { error } = await db
            .from('car_wash_memberships')
            .insert({
                user_id: state.user.id,
                name: name,
                monthly_cost: monthlyCost,
                start_date: startDate,
                is_active: true
            });
        
        if (error) throw error;
        
        showToast('Membership išsaugotas', 'success');
        return true;
        
    } catch (error) {
        console.error('Error saving car wash membership:', error);
        showToast('Nepavyko išsaugoti', 'error');
        return false;
    }
}

export async function deactivateCarWashMembership() {
    try {
        const { error } = await db
            .from('car_wash_memberships')
            .update({ is_active: false })
            .eq('user_id', state.user.id)
            .eq('is_active', true);
        
        if (error) throw error;
        
        showToast('Membership deaktyvuotas', 'success');
        return true;
        
    } catch (error) {
        console.error('Error deactivating membership:', error);
        showToast('Nepavyko deaktyvuoti', 'error');
        return false;
    }
}

// ────────────────────────────────────────────────────────────────
// 7. FIXED EXPENSES - VALDYMAS
// ────────────────────────────────────────────────────────────────

export async function loadFixedExpenses() {
    try {
        const { data, error } = await db
            .from('fixed_expense_categories')
            .select('*')
            .eq('user_id', state.user.id)
            .eq('is_active', true)
            .order('category', { ascending: true });
        
        if (error) throw error;
        
        return data || [];
        
    } catch (error) {
        console.error('Error loading fixed expenses:', error);
        return [];
    }
}

export async function addFixedExpense(name, category, amountMonthly) {
    try {
        const { error } = await db
            .from('fixed_expense_categories')
            .insert({
                user_id: state.user.id,
                name: name,
                category: category,
                amount_monthly: amountMonthly,
                is_active: true
            });
        
        if (error) throw error;
        
        showToast('Išlaida pridėta', 'success');
        return true;
        
    } catch (error) {
        console.error('Error adding fixed expense:', error);
        showToast('Nepavyko pridėti', 'error');
        return false;
    }
}

export async function deleteFixedExpense(id) {
    try {
        const { error } = await db
            .from('fixed_expense_categories')
            .update({ is_active: false })
            .eq('id', id);
        
        if (error) throw error;
        
        showToast('Išlaida ištrinta', 'success');
        return true;
        
    } catch (error) {
        console.error('Error deleting fixed expense:', error);
        showToast('Nepavyko ištrinti', 'error');
        return false;
    }
}

// ────────────────────────────────────────────────────────────────
// 8. TIMEZONE SĄRAŠAI (Dropdown options)
// ────────────────────────────────────────────────────────────────

export const TIMEZONES = {
    'America/Chicago': '🇺🇸 Chicago (CST/CDT)',
    'America/New_York': '🇺🇸 New York (EST/EDT)',
    'America/Los_Angeles': '🇺🇸 Los Angeles (PST/PDT)',
    'America/Denver': '🇺🇸 Denver (MST/MDT)',
    'Europe/Vilnius': '🇱🇹 Vilnius (EET/EEST)',
    'Europe/London': '🇬🇧 London (GMT/BST)',
    'Europe/Paris': '🇫🇷 Paris (CET/CEST)',
    'Europe/Moscow': '🇷🇺 Moscow (MSK)',
    'Asia/Tokyo': '🇯🇵 Tokyo (JST)',
    'Australia/Sydney': '🇦🇺 Sydney (AEDT/AEST)'
};

export const WEEKDAYS = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 7, label: 'Sunday' }
];

export const CLOCK_POSITIONS = [
    { value: 'header', label: 'Header (viršuje)' },
    { value: 'cockpit', label: 'Cockpit (virš laikmačio)' },
    { value: 'both', label: 'Abu (header + cockpit)' },
    { value: 'hidden', label: 'Paslėpti' }
];
