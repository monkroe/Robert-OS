// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/GARAGE.JS v2.1.0
// Logic: Fleet Management with Odometer & CarWash
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

// ────────────────────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────────────────────

let editingId = null;
let pendingDeleteId = null;

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// SYNC ENGINE
// ────────────────────────────────────────────────────────────────

export async function fetchFleet() {
    try {
        // PASTABA: Naudojama lentelė 'vehicles'. Įsitikink, kad Supabase ji taip vadinasi.
        const { data, error } = await db
            .from('vehicles')
            .select('*')
            .eq('user_id', state.user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        state.fleet = data || [];
        renderGarageList();
    } catch (e) { 
        console.error(e);
        showToast('GARAŽO KLAIDA', 'error'); 
    }
}

// ────────────────────────────────────────────────────────────────
// UI ACTIONS
// ────────────────────────────────────────────────────────────────

export function openGarage() {
    vibrate([10]);
    resetForm();
    renderGarageList();
    openModal('garage-modal');
}

export function resetForm() {
    editingId = null;
    
    // Išvalome visus inputus
    const ids = ['veh-name', 'veh-cost', 'veh-carwash', 'veh-year', 'veh-initial-odo'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    setVehType('rental');
    
    // Reset Test Mode
    const testInput = document.getElementById('veh-is-test');
    if (testInput) testInput.value = 'false';
    updateTestUI(false);
    
    // Reset Button Text
    const btn = document.getElementById('btn-save-veh');
    if (btn) {
        btn.textContent = 'PRIDĖTI Į GARAŽĄ';
        btn.dataset.id = '';
    }
    
    const title = document.getElementById('garage-modal-title');
    if (title) title.textContent = 'GARAŽO VALDYMAS';
}

export function setVehType(type) {
    vibrate();
    const input = document.getElementById('veh-type');
    if (input) input.value = type;
    
    document.querySelectorAll('.veh-type-btn').forEach(b => {
        if (b.id === `btn-type-${type}`) b.classList.add('active');
        else b.classList.remove('active');
    });
}

export function toggleTestMode() {
    vibrate();
    const input = document.getElementById('veh-is-test');
    const isTest = input.value !== 'true';
    input.value = String(isTest);
    updateTestUI(isTest);
}

function updateTestUI(active) {
    const btn = document.getElementById('btn-test-mode');
    const dot = document.getElementById('test-indicator');
    
    if (active) {
        btn?.classList.remove('opacity-60', 'border-gray-700');
        btn?.classList.add('border-yellow-500', 'bg-yellow-500/10');
        dot?.classList.remove('bg-gray-600');
        dot?.classList.add('bg-yellow-400', 'shadow-[0_0_8px_rgba(250,204,21,0.8)]');
    } else {
        btn?.classList.add('opacity-60', 'border-gray-700');
        btn?.classList.remove('border-yellow-500', 'bg-yellow-500/10');
        dot?.classList.add('bg-gray-600');
        dot?.classList.remove('bg-yellow-400', 'shadow-[0_0_8px_rgba(250,204,21,0.8)]');
    }
}

// ────────────────────────────────────────────────────────────────
// CRUD OPERATIONS
// ────────────────────────────────────────────────────────────────

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name')?.value.trim();
    if (!name) return showToast('ĮVESKITE PAVADINIMĄ', 'warning');

    state.loading = true;
    
    try {
        const payload = {
            user_id: state.user.id,
            name: name,
            type: document.getElementById('veh-type').value,
            year: parseInt(document.getElementById('veh-year').value) || null,
            initial_odometer: parseFloat(document.getElementById('veh-initial-odo').value) || 0,
            operating_cost_weekly: parseFloat(document.getElementById('veh-cost').value) || 0,
            carwash_monthly_cost: parseFloat(document.getElementById('veh-carwash').value) || 0,
            is_test: document.getElementById('veh-is-test').value === 'true',
            is_active: true
        };

        let error;
        if (editingId) {
            ({ error } = await db.from('vehicles').update(payload).eq('id', editingId));
        } else {
            ({ error } = await db.from('vehicles').insert([payload]));
        }

        if (error) throw error;

        showToast(editingId ? 'DUOMENYS ATNAUJINTI' : 'NAUJAS AUTOMOBILIS PRIDĖTAS', 'success');
        resetForm();
        await fetchFleet();
        closeModals();
        
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    } finally {
        state.loading = false;
    }
}

export function editVehicle(id) {
    vibrate();
    const v = state.fleet.find(x => x.id === id);
    if (!v) return;

    editingId = id;

    // Užpildome formą
    document.getElementById('veh-name').value = v.name;
    document.getElementById('veh-year').value = v.year || '';
    document.getElementById('veh-initial-odo').value = v.initial_odometer || '';
    document.getElementById('veh-cost').value = v.operating_cost_weekly || '';
    document.getElementById('veh-carwash').value = v.carwash_monthly_cost || '';
    document.getElementById('veh-is-test').value = String(v.is_test);

    setVehType(v.type);
    updateTestUI(v.is_test);

    // UI pakeitimai
    document.getElementById('garage-modal-title').textContent = 'REDAGUOTI AUTOMOBILĮ';
    document.getElementById('btn-save-veh').textContent = 'IŠSAUGOTI PAKEITIMUS';
    document.getElementById('btn-save-veh').dataset.id = id;
    
    openModal('garage-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE LOGIC (Custom Modal)
// ────────────────────────────────────────────────────────────────

export function deleteVehicle(id) {
    vibrate([20]);
    const vehicle = state.fleet.find(v => v.id === id);
    if (!vehicle) return;
    
    pendingDeleteId = id;
    
    // UI tekstų atnaujinimas modale
    const msgEl = document.getElementById('delete-vehicle-message');
    if (msgEl) msgEl.innerHTML = `Pašalinti <strong>${escapeHtml(vehicle.name)}</strong> iš garažo?`;
    
    openModal('delete-vehicle-modal');
}

export async function confirmDeleteVehicle() {
    if (!pendingDeleteId) return;
    
    state.loading = true;
    try {
        // "Soft Delete" - tik paslepiame, kad liktų istorija
        const { error } = await db
            .from('vehicles')
            .update({ is_active: false })
            .eq('id', pendingDeleteId);
            
        if (error) throw error;
        
        showToast('AUTOMOBILIS PAŠALINTAS', 'info');
        await fetchFleet();
        
    } catch (e) {
        showToast('KLAIDA ŠALINANT', 'error');
    } finally {
        state.loading = false;
        pendingDeleteId = null;
        closeModals();
    }
}

export function cancelDeleteVehicle() {
    vibrate();
    pendingDeleteId = null;
    closeModals();
}

// ────────────────────────────────────────────────────────────────
// LIST RENDERER
// ────────────────────────────────────────────────────────────────

function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;

    if (!state.fleet.length) {
        list.innerHTML = '<div class="text-center py-8 opacity-30 text-[10px] uppercase font-bold tracking-widest">Garažas tuščias</div>';
        return;
    }

    list.innerHTML = state.fleet.map(v => {
        const safeName = escapeHtml(v.name);
        const isTest = v.is_test;
        const styleClass = isTest 
            ? 'border-yellow-500/20 bg-yellow-500/5' 
            : 'border-white/10 bg-white/5';
            
        return `
        <div class="flex items-center justify-between p-3 mb-2 rounded-xl border ${styleClass}">
            <div class="text-left">
                <div class="flex items-center gap-2">
                    <span class="font-bold uppercase text-sm tracking-tight text-white">${safeName}</span>
                    ${isTest ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded font-bold">TEST</span>' : ''}
                </div>
                <div class="text-[9px] opacity-50 uppercase mt-1 font-mono">
                    $${v.operating_cost_weekly || 0}/wk • 🧼 $${v.carwash_monthly_cost || 0}/mo
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="editVehicle('${v.id}')" class="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-teal-500 active:scale-95 transition-transform">
                    <i class="fa-solid fa-pen text-xs"></i>
                </button>
                <button onclick="deleteVehicle('${v.id}')" class="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 active:scale-95 transition-transform">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
}
