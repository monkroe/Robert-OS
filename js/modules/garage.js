// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE MODULE v1.7.2 (FIXED)
// Fleet Management with Rental Dates & Car Wash
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// 1. INITIALIZATION (Inject HTML)
// ────────────────────────────────────────────────────────────────

export function initGarageModals() {
    console.log('🚗 Garage modals injected');
    
    const container = document.getElementById('modals-container');
    if (!container) return;

    container.innerHTML += `
        <div id="garage-modal" class="modal-overlay hidden">
            <div class="modal-card max-w-md w-full h-[85vh] flex flex-col">
                <div class="modal-header shrink-0">
                    <h3 class="font-black text-lg">GARAŽAS</h3>
                    <button onclick="closeModals()" class="text-xl opacity-50">&times;</button>
                </div>
                
                <div class="modal-body flex-1 overflow-y-auto space-y-6">
                    
                    <div class="bg-gray-100 dark:bg-white/5 p-4 rounded-xl border border-gray-200 dark:border-white/10">
                        <div class="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                            <button id="btn-type-rental" onclick="setVehType('rental')" class="veh-type-btn btn-xs active bg-teal-500 text-black border-teal-500">
                                <i class="fa-solid fa-car mr-1"></i> Nuoma
                            </button>
                            <button id="btn-type-owned" onclick="setVehType('owned')" class="veh-type-btn btn-xs opacity-50">
                                <i class="fa-solid fa-house-chimney mr-1"></i> Nuosava
                            </button>
                        </div>
                        
                        <div class="space-y-3">
                            <input type="text" id="veh-name" placeholder="Automobilio modelis" class="input-field font-bold">
                            
                            <div class="grid grid-cols-2 gap-3">
                                <input type="number" id="veh-year" placeholder="Metai (2020)" class="input-field text-sm">
                                <input type="number" id="veh-initial-odo" placeholder="Rida (Km)" class="input-field text-sm">
                            </div>

                            <input type="number" id="veh-cost" placeholder="Savaitės kaina (€)" class="input-field text-teal-400 font-mono">
                            
                            <div id="rental-fields" class="space-y-3 animate-fadeIn">
                                <div class="space-y-1">
                                    <label class="text-[10px] uppercase font-bold opacity-50 ml-1">Nuomos pradžia</label>
                                    <input type="date" id="veh-rental-start" class="input-field text-sm">
                                </div>
                            </div>

                            <input type="number" id="veh-carwash" placeholder="Plovimas/mėn (€)" class="input-field text-sm">
                            
                            <div onclick="toggleTestMode()" id="btn-test-mode" class="cursor-pointer border border-gray-700 opacity-60 rounded-lg p-3 flex items-center justify-between transition-all hover:opacity-100">
                                <div class="flex items-center gap-2">
                                    <i class="fa-solid fa-flask text-sm"></i>
                                    <span class="text-xs font-bold uppercase">Test Drive</span>
                                </div>
                                <div id="test-indicator" class="w-3 h-3 rounded-full bg-gray-700 transition-colors"></div>
                            </div>

                            <input type="hidden" id="veh-type" value="rental">
                            <input type="hidden" id="veh-is-test" value="false">

                            <button onclick="saveVehicle()" class="btn-primary-os w-full mt-2">
                                <i class="fa-solid fa-plus mr-2"></i> PRIDĖTI
                            </button>
                        </div>
                    </div>

                    <div>
                        <h4 class="text-xs font-bold opacity-50 uppercase mb-3 ml-1">Mano Automobiliai</h4>
                        <div id="garage-list" class="space-y-2 pb-10">
                            </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="delete-vehicle-modal" class="modal-overlay hidden">
            <div class="modal-card max-w-sm">
                <div class="modal-header">
                    <h3 id="delete-vehicle-title" class="font-black text-lg text-red-500">DELETE VEHICLE?</h3>
                </div>
                <div class="modal-body text-center space-y-4">
                    <div id="delete-vehicle-icon" class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500 text-2xl">
                        <i class="fa-solid fa-trash"></i>
                    </div>
                    <p id="delete-vehicle-message" class="text-sm opacity-75">
                        Ar tikrai?
                    </p>
                </div>
                <div class="modal-footer grid grid-cols-2 gap-3">
                    <button onclick="cancelDeleteVehicle()" class="btn-secondary">ATŠAUKTI</button>
                    <button onclick="confirmDeleteVehicle()" class="btn-primary-os bg-red-500 border-red-500 text-white">IŠTRINTI</button>
                </div>
            </div>
        </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// 2. DATA LOADING (Pervadinta į loadFleet)
// ────────────────────────────────────────────────────────────────

export async function loadFleet() {
    try {
        const { data, error } = await db
            .from('vehicles')
            .select('*')
            .eq('user_id', state.user.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        state.fleet = (data || []).filter(v => v.is_active === true);
        console.log(`🚗 Loaded ${state.fleet.length} vehicles`);
        
        // Jei garažas atidarytas, atnaujinam sąrašą realiu laiku
        if (!document.getElementById('garage-modal')?.classList.contains('hidden')) {
            renderGarageList();
        }
        
    } catch (error) {
        console.error('Error loading fleet:', error);
        state.fleet = [];
    }
}

// ────────────────────────────────────────────────────────────────
// 3. UI LOGIC & HELPERS
// ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function openGarage() {
    vibrate();
    
    // Reset fields
    const fields = ['veh-name', 'veh-year', 'veh-initial-odo', 'veh-cost', 'veh-rental-start', 'veh-carwash'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });

    setVehType('rental');
    
    const testInput = document.getElementById('veh-is-test');
    if(testInput) testInput.value = 'false';
    updateTestUI(false);

    renderGarageList();
    window.openModal('garage-modal');
}

export function setVehType(type) {
    vibrate();
    const input = document.getElementById('veh-type');
    if(input) input.value = type;
    
    document.querySelectorAll('.veh-type-btn').forEach(b => {
        b.classList.remove('active', 'bg-teal-500', 'text-black', 'border-teal-500');
        b.classList.add('opacity-50');
    });
    
    const activeBtn = document.getElementById(`btn-type-${type}`);
    if (activeBtn) {
        activeBtn.classList.remove('opacity-50');
        activeBtn.classList.add('active', 'bg-teal-500', 'text-black', 'border-teal-500');
    }
    
    const rentalFields = document.getElementById('rental-fields');
    if (rentalFields) {
        if (type === 'rental') rentalFields.classList.remove('hidden');
        else rentalFields.classList.add('hidden');
    }
}

export function toggleTestMode() {
    vibrate();
    const input = document.getElementById('veh-is-test');
    if(!input) return;
    
    const isTest = !(input.value === 'true');
    input.value = String(isTest);
    updateTestUI(isTest);
}

function updateTestUI(isActive) {
    const btn = document.getElementById('btn-test-mode');
    const dot = document.getElementById('test-indicator');
    if(!btn || !dot) return;
    
    if (isActive) {
        btn.className = "cursor-pointer border border-yellow-500 bg-yellow-500/10 rounded-lg p-3 flex items-center justify-between transition-all";
        dot.className = "w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]";
    } else {
        btn.className = "cursor-pointer border border-gray-700 opacity-60 rounded-lg p-3 flex items-center justify-between transition-all hover:opacity-100";
        dot.className = "w-3 h-3 rounded-full bg-gray-700";
    }
}

export function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;

    if (!state.fleet || state.fleet.length === 0) {
        list.innerHTML = '<div class="text-center py-6"><p class="text-xs text-gray-500 uppercase tracking-widest">Garažas tuščias</p></div>';
        return;
    }

    list.innerHTML = state.fleet.map(v => {
        const safeName = escapeHtml(v.name);
        const typeLabel = v.type === 'rental' ? 'NUOMA' : 'NUOSAVA';
        const safeCost = escapeHtml(v.operating_cost_weekly || 0);
        const yearInfo = v.year ? ` (${v.year})` : '';
        const currentOdo = v.last_odo || v.initial_odometer || 0;
        
        const isTest = v.is_test;
        const borderClass = isTest 
            ? 'border-yellow-500/50 bg-yellow-500/5' 
            : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5';
            
        const testBadge = isTest 
            ? `<span class="text-[10px] font-bold px-2 py-1 rounded bg-yellow-400 text-black uppercase ml-2 shadow-sm"><i class="fa-solid fa-flask mr-1"></i>TEST</span>` 
            : '';
        
        return `
        <div class="group relative flex items-center justify-between p-4 mb-3 rounded-xl border ${borderClass} transition-all">
            <div class="flex flex-col text-left">
                <div class="flex items-center">
                    <span class="text-base font-bold text-gray-900 dark:text-white tracking-tight">${safeName}${yearInfo}</span>
                    ${testBadge}
                </div>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 uppercase">${typeLabel}</span>
                    <span class="text-[10px] text-gray-500 dark:text-gray-400 font-mono">€${safeCost}/sav</span>
                </div>
                ${currentOdo ? `<div class="mt-1 text-[10px] text-gray-400 font-mono">Rida: ${currentOdo} km</div>` : ''}
            </div>
            <button onclick="window.deleteVehicle('${v.id}')" 
                class="h-10 w-10 flex items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-500 border border-red-500/20 active:scale-95 transition-transform">
                <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
        </div>
    `}).join('');
}

// ────────────────────────────────────────────────────────────────
// 4. DATABASE ACTIONS
// ────────────────────────────────────────────────────────────────

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name')?.value.trim();
    const year = document.getElementById('veh-year')?.value.trim();
    const initialOdo = document.getElementById('veh-initial-odo')?.value.trim();
    const cost = document.getElementById('veh-cost')?.value;
    const rentalStart = document.getElementById('veh-rental-start')?.value;
    const carwash = document.getElementById('veh-carwash')?.value;
    const type = document.getElementById('veh-type')?.value;
    const isTest = document.getElementById('veh-is-test')?.value === 'true';

    if (!name) return showToast('Reikia pavadinimo', 'error');

    state.loading = true;
    try {
        const vehicleData = {
            user_id: state.user.id,
            name: name,
            type: type,
            operating_cost_weekly: parseFloat(cost || 0),
            is_active: true,
            is_test: isTest
        };
        
        if (year) vehicleData.year = parseInt(year);
        if (initialOdo) {
            vehicleData.initial_odometer = parseInt(initialOdo);
            vehicleData.last_odo = parseInt(initialOdo);
        }
        if (rentalStart) vehicleData.rental_start_date = rentalStart;
        if (carwash) vehicleData.carwash_monthly_cost = parseFloat(carwash);
        
        const { error } = await db.from('vehicles').insert(vehicleData);
        
        if (error) throw error;
        
        showToast('Automobilis pridėtas!', 'success');
        
        // Reset form
        openGarage(); 
        
        // Reload data
        await loadFleet();
        
    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// Delete Logic
let pendingDeleteId = null;

export async function deleteVehicle(id) {
    vibrate([20]);
    const vehicle = state.fleet.find(v => v.id === id);
    if (!vehicle) return;
    
    pendingDeleteId = id;
    const isTest = vehicle.is_test;
    
    const confirmModal = document.getElementById('delete-vehicle-modal');
    if (confirmModal) {
        const titleEl = document.getElementById('delete-vehicle-title');
        const messageEl = document.getElementById('delete-vehicle-message');
        const iconEl = document.getElementById('delete-vehicle-icon');
        
        if (isTest) {
            if (titleEl) titleEl.textContent = 'DELETE TEST CAR?';
            if (messageEl) messageEl.innerHTML = `Vehicle <strong>${escapeHtml(vehicle.name)}</strong> is a test drive.<br>Data will be wiped.`;
        } else {
            if (titleEl) titleEl.textContent = 'ARCHIVE VEHICLE?';
            if (messageEl) messageEl.innerHTML = `Delete <strong>${escapeHtml(vehicle.name)}</strong>?<br>History will be saved.`;
        }
        
        window.openModal('delete-vehicle-modal');
    }
}

export async function confirmDeleteVehicle() {
    if (!pendingDeleteId) return;
    
    const vehicle = state.fleet.find(v => v.id === pendingDeleteId);
    const isTest = vehicle?.is_test;
    
    window.closeModals();
    await executeDelete(pendingDeleteId, isTest);
    pendingDeleteId = null;
}

export function cancelDeleteVehicle() {
    vibrate();
    pendingDeleteId = null;
    window.closeModals();
}

async function executeDelete(id, isTest) {
    state.loading = true;
    try {
        if (isTest) {
            // Hard delete for test cars
            await db.from('expenses').delete().eq('vehicle_id', id);
            await db.from('finance_shifts').delete().eq('vehicle_id', id);
            await db.from('vehicles').delete().eq('id', id);
            showToast('Test vehicle wiped', 'success');
        } else {
            // Soft delete (archive) for real cars
            const { error } = await db.from('vehicles').update({ is_active: false }).eq('id', id);
            if (error) throw error;
            showToast('Vehicle archived', 'success');
        }
        
        await loadFleet();
        
    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// 5. WINDOW EXPORTS (Kad veiktų HTML mygtukai)
// ────────────────────────────────────────────────────────────────

window.openGarage = openGarage;
window.setVehType = setVehType;
window.toggleTestMode = toggleTestMode;
window.saveVehicle = saveVehicle;
window.deleteVehicle = deleteVehicle;
window.confirmDeleteVehicle = confirmDeleteVehicle;
window.cancelDeleteVehicle = cancelDeleteVehicle;
