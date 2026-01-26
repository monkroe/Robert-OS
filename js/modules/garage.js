// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE MODULE v1.8.0 (EDIT & UI FIX)
// Fleet Management with Edit Functionality & Improved UI
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// STATE & HELPERS
// ────────────────────────────────────────────────────────────────

let editingId = null; // ID automobilio, kurį redaguojame
let pendingDeleteId = null;

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// DATA FETCHING
// ────────────────────────────────────────────────────────────────

export async function fetchFleet() {
    try {
        const { data, error } = await db
            .from('vehicles')
            .select('*')
            .eq('user_id', state.user.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        state.fleet = (data || []).filter(v => v.is_active === true);
    } catch (error) {
        console.error('Error fetching fleet:', error);
        showToast('Nepavyko užkrauti garažo', 'error');
        state.fleet = [];
    }
}

// ────────────────────────────────────────────────────────────────
// MODAL ACTIONS (OPEN / EDIT)
// ────────────────────────────────────────────────────────────────

export function openGarage() {
    vibrate();
    resetForm(); // Išvalome formą prieš atidarant
    renderGarageList();
    if (window.openModal) window.openModal('garage-modal');
}

export function editVehicle(id) {
    vibrate();
    const vehicle = state.fleet.find(v => v.id === id);
    if (!vehicle) return;

    editingId = id; // Nustatome redagavimo būseną

    // Užpildome formą esamais duomenimis
    document.getElementById('veh-name').value = vehicle.name;
    document.getElementById('veh-cost').value = vehicle.operating_cost_weekly || '';
    document.getElementById('veh-is-test').value = String(vehicle.is_test);
    
    setVehType(vehicle.type);
    updateTestUI(vehicle.is_test);

    // Pakeičiame mygtuko tekstą ir antraštę
    document.getElementById('btn-save-veh').textContent = 'ATNAUJINTI DUOMENIS';
    document.getElementById('garage-modal-title').textContent = 'REDAGUOTI AUTOMOBILĮ';

    if (window.openModal) window.openModal('garage-modal');
}

function resetForm() {
    editingId = null;
    document.getElementById('veh-name').value = '';
    document.getElementById('veh-cost').value = '';
    setVehType('rental');
    document.getElementById('veh-is-test').value = 'false';
    updateTestUI(false);
    
    // Grąžiname tekstus į "Add New" būseną
    document.getElementById('btn-save-veh').textContent = 'PRIDĖTI Į GARAŽĄ';
    document.getElementById('garage-modal-title').textContent = 'GARAŽO VALDYMAS';
}

// ────────────────────────────────────────────────────────────────
// SAVE / UPDATE VEHICLE
// ────────────────────────────────────────────────────────────────

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name').value.trim();
    const cost = parseFloat(document.getElementById('veh-cost').value) || 0;
    const type = document.getElementById('veh-type').value;
    const isTest = document.getElementById('veh-is-test').value === 'true';

    if (!name) return showToast('Įveskite pavadinimą', 'error');

    state.loading = true;
    try {
        const payload = {
            name: name,
            type: type,
            operating_cost_weekly: cost,
            is_test: isTest
        };

        if (editingId) {
            // UPDATE (Redagavimas)
            const { error } = await db
                .from('vehicles')
                .update(payload)
                .eq('id', editingId);
            if (error) throw error;
            showToast('Automobilis atnaujintas', 'success');
        } else {
            // INSERT (Naujas)
            payload.user_id = state.user.id;
            payload.is_active = true;
            const { error } = await db.from('vehicles').insert(payload);
            if (error) throw error;
            showToast(isTest ? 'Testinis automobilis sukurtas' : 'Automobilis pridėtas', 'success');
        }
        
        resetForm();
        await fetchFleet();
        renderGarageList();
        if (window.closeModals) window.closeModals();
        
    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// DELETE VEHICLE
// ────────────────────────────────────────────────────────────────

export function deleteVehicle(id) {
    vibrate([20]);
    const vehicle = state.fleet.find(v => v.id === id);
    if (!vehicle) return;
    
    pendingDeleteId = id;
    const isTest = vehicle.is_test;
    
    const modal = document.getElementById('delete-vehicle-modal');
    if (modal) {
        const titleEl = modal.querySelector('#delete-vehicle-title');
        const messageEl = modal.querySelector('#delete-vehicle-message');
        const iconEl = modal.querySelector('#delete-vehicle-icon');
        
        if (isTest) {
            if (titleEl) titleEl.textContent = 'Pašalinti bandomąjį?';
            if (messageEl) messageEl.innerHTML = `Automobilis <strong>${escapeHtml(vehicle.name)}</strong> ir visi jo duomenys bus ištrinti negrįžtamai.`;
            if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-flask"></i>';
        } else {
            if (titleEl) titleEl.textContent = 'Archyvuoti automobilį?';
            if (messageEl) messageEl.innerHTML = `<strong>${escapeHtml(vehicle.name)}</strong> bus paslėptas, bet istorija išliks.`;
            if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-box-archive"></i>';
        }
        if (window.openModal) window.openModal('delete-vehicle-modal');
    }
}

export async function confirmDeleteVehicle() {
    if (!pendingDeleteId) return;
    const vehicle = state.fleet.find(v => v.id === pendingDeleteId);
    if (!vehicle) return;

    if (window.closeModals) window.closeModals();
    state.loading = true;
    
    try {
        if (vehicle.is_test) {
            // Testinį triname visišai
            await db.from('expenses').delete().eq('vehicle_id', pendingDeleteId);
            await db.from('finance_shifts').delete().eq('vehicle_id', pendingDeleteId);
            await db.from('vehicles').delete().eq('id', pendingDeleteId);
            showToast('Bandomasis automobilis ištrintas', 'success');
        } else {
            // Tikrą archyvuojame (soft delete)
            const { error } = await db
                .from('vehicles')
                .update({ is_active: false })
                .eq('id', pendingDeleteId);
            if (error) throw error;
            showToast('Automobilis archyvuotas', 'success');
        }
        
        await fetchFleet();
        renderGarageList();
    } catch (e) { 
        showToast('Klaida: ' + e.message, 'error'); 
    } finally { 
        state.loading = false; 
        pendingDeleteId = null;
    }
}

export function cancelDeleteVehicle() {
    vibrate();
    pendingDeleteId = null;
    if (window.closeModals) window.closeModals();
}

// ────────────────────────────────────────────────────────────────
// UI RENDERING & TOGGLES
// ────────────────────────────────────────────────────────────────

export function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;

    if (state.fleet.length === 0) {
        list.innerHTML = '<div class="text-center py-6 opacity-50 text-xs uppercase">Garažas tuščias</div>';
        return;
    }

    list.innerHTML = state.fleet.map(v => {
        const safeName = escapeHtml(v.name);
        const safeType = escapeHtml(v.type);
        const cost = v.operating_cost_weekly || 0;
        const isTest = v.is_test;

        const borderClass = isTest ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/10 bg-white/5';
        const badge = isTest ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500 text-black ml-2"><i class="fa-solid fa-flask mr-1"></i>TEST</span>` : '';

        // Pridėtas EDIT mygtukas (pieštukas)
        return `
        <div class="group relative flex items-center justify-between p-3 mb-2 rounded-xl border ${borderClass} transition-all">
            <div class="flex flex-col text-left">
                <div class="flex items-center">
                    <span class="text-sm font-bold tracking-tight">${safeName}</span>
                    ${badge}
                </div>
                <div class="flex items-center gap-2 mt-1 opacity-70">
                    <span class="text-[9px] font-bold uppercase">${safeType}</span>
                    <span class="text-[9px] font-mono">$${cost}/wk</span>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="editVehicle('${v.id}')" class="h-8 w-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors active:scale-95">
                    <i class="fa-solid fa-pen-to-square text-xs"></i>
                </button>
                <button onclick="deleteVehicle('${v.id}')" class="h-8 w-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors active:scale-95">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        </div>
    `}).join('');
}

export function setVehType(type) {
    vibrate();
    document.getElementById('veh-type').value = type;
    
    // Atnaujiname naujus segmented buttons
    document.querySelectorAll('.veh-type-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-type-${type}`);
    if (activeBtn) activeBtn.classList.add('active');
}

export function toggleTestMode() {
    vibrate();
    const input = document.getElementById('veh-is-test');
    const isTest = !(input.value === 'true');
    input.value = String(isTest);
    updateTestUI(isTest);
}

function updateTestUI(isActive) {
    const btn = document.getElementById('btn-test-mode');
    const dot = document.getElementById('test-indicator');
    
    if (isActive) {
        btn.className = "cursor-pointer border border-yellow-500 bg-yellow-500/10 rounded-lg p-3 flex items-center justify-between transition-all";
        dot.className = "w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]";
    } else {
        btn.className = "cursor-pointer border border-gray-700 opacity-60 rounded-lg p-3 flex items-center justify-between transition-all hover:opacity-100";
        dot.className = "w-3 h-3 rounded-full bg-gray-600";
    }
}
