// ════════════════════════════════════════════════════════════════
// ROBERT OS - SETTINGS MODULE v1.7.2 (FIXED)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// 1. INITIALIZATION (Inject HTML)
// ────────────────────────────────────────────────────────────────

export function initSettingsModal() {
    console.log('⚙️ Settings modal injected');
    
    const container = document.getElementById('modals-container');
    if (!container) return;

    container.innerHTML += `
        <div id="settings-modal" class="modal-overlay hidden">
            <div class="modal-card max-w-sm w-full h-[85vh] flex flex-col">
                <div class="modal-header shrink-0">
                    <h3 class="font-black text-lg">NUSTATYMAI</h3>
                    <button onclick="closeModals()" class="text-xl opacity-50">&times;</button>
                </div>
                
                <div class="modal-body flex-1 overflow-y-auto space-y-6">
                    
                    <div class="space-y-3">
                        <label class="label-xs text-teal-500">BENDRA</label>
                        
                        <div class="input-group">
                            <label class="text-xs opacity-70 mb-1 block">Laiko Juosta (Pagrindinė)</label>
                            <select id="settings-tz-primary" class="input-field text-sm">
                                <option value="America/Chicago">Chicago (CST)</option>
                                <option value="America/New_York">New York (EST)</option>
                                <option value="Europe/Vilnius">Vilnius (EET)</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label class="text-xs opacity-70 mb-1 block">Laiko Juosta (Antrinė)</label>
                            <select id="settings-tz-secondary" class="input-field text-sm">
                                <option value="Europe/Vilnius">Vilnius (EET)</option>
                                <option value="America/Chicago">Chicago (CST)</option>
                                <option value="UTC">UTC</option>
                            </select>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <label class="label-xs text-purple-500">FINANSAI</label>
                        
                        <div class="input-group">
                            <label class="text-xs opacity-70 mb-1 block">Fiksuotos Išlaidos / mėn ($)</label>
                            <input type="number" id="settings-fixed-expenses" class="input-field font-mono" placeholder="0.00">
                        </div>

                        <div class="input-group">
                            <label class="text-xs opacity-70 mb-1 block">Nuomos Savaitės Pradžia</label>
                            <select id="settings-rental-start-day" class="input-field text-sm">
                                <option value="1">Pirmadienis</option>
                                <option value="2">Antradienis</option>
                                <option value="3">Trečiadienis</option>
                                <option value="0">Sekmadienis</option>
                            </select>
                        </div>
                        
                        <div class="input-group">
                            <label class="text-xs opacity-70 mb-1 block">Pamainos Tikslas (Val.)</label>
                            <input type="number" id="settings-shift-target" class="input-field font-mono" placeholder="12">
                        </div>
                    </div>

                    <div class="space-y-3">
                        <label class="label-xs text-blue-500">SĄSAJA</label>
                        
                        <div class="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                            <span class="text-sm font-bold">Pranešimai</span>
                            <input type="checkbox" id="settings-notifications" class="w-5 h-5 accent-teal-500">
                        </div>
                        
                        <div class="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 opacity-50 pointer-events-none">
                            <span class="text-sm font-bold">Compact Mode</span>
                            <input type="checkbox" id="settings-compact-mode" class="w-5 h-5 accent-teal-500">
                        </div>

                        <div class="hidden">
                             <input type="hidden" id="settings-clock-pos" value="cockpit">
                        </div>
                    </div>
                    
                    <div class="pt-4">
                        <button onclick="saveSettings()" class="btn-primary-os w-full">
                            IŠSAUGOTI
                        </button>
                    </div>

                    <div class="text-center pt-6 pb-2">
                        <p class="text-[10px] opacity-30 font-mono">Robert OS v1.7.2</p>
                    </div>

                </div>
            </div>
        </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// 2. LOAD & SYNC
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
        // Silent fail on load to not block UI
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
// 3. UI INTERACTIONS
// ────────────────────────────────────────────────────────────────

export async function openSettings() {
    vibrate();
    
    // Ensure data is fresh or use state
    const settings = state.userSettings || await loadSettings();
    if (!settings) return; // Should not happen if createDefault works
    
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
    
    if (window.openModal) window.openModal('settings-modal');
    else document.getElementById('settings-modal')?.classList.remove('hidden');
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
        
        if (window.closeModals) window.closeModals();
        else document.getElementById('settings-modal')?.classList.add('hidden');

        showToast('Nustatymai išsaugoti ✅', 'success');
        
        // Trigger generic refresh
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (error) {
        console.error('Settings save error:', error);
        showToast('Klaida saugant nustatymus', 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// UTILS & EXPORTS
// ────────────────────────────────────────────────────────────────

function getVal(id) {
    return document.getElementById(id)?.value;
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

// Explicit window export for HTML onclick handlers
window.openSettings = openSettings;
window.saveSettings = saveSettings;
