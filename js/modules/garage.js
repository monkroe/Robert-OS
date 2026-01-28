// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE MODULE v2.0.0
// Fleet Management with CarWash Logic & Security Fixes
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// STATE & HELPERS
// ────────────────────────────────────────────────────────────────

let editingId = null;
let pendingDeleteId = null;

// Saugumo funkcija: apsaugo nuo kenksmingo kodo įrašų pavadinimuose
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// DATA FETCHING (Server-side filtering)
// ────────────────────────────────────────────────────────────────

export async function fetchFleet() {
    try {
        const { data, error } = await db
            .from('vehicles')
            .select('*')
            .eq('user_id', state.user.id)
            .eq('is_active', true) // Filtruojame serveryje
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        state.fleet = data || [];
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
    resetForm();
    renderGarageList();
    if (window.openModal) window.openModal('garage-modal');
}

export function editVehicle(id) {
    vibrate();
    const v = state.fleet.find(x => x.id === id);
    if (!v) return;

    editingId = id;

    // Užpildome formą (įskaitant naują carwash lauką)
    const fields = {
        'veh-name': v.name,
        'veh-cost': v.operating_cost_weekly || '',
        'veh-carwash': v.carwash_monthly_cost || '',
        'veh-is-test': String(v.is_test)
    };

    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });
    
    setVehType(v.type);
    updateTestUI(v.is_test);

    document.getElementById('btn-save-veh').textContent = 'ATNAUJINTI DUOMENIS';
    document.getElementById('garage-modal-title').textContent = 'REDAGUOTI AUTOMOBILĮ';
}

export function resetForm() {
    editingId = null;
    const ids = ['veh-name', 'veh-cost', 'veh-carwash', 'veh-year', 'veh-initial-odo'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    setVehType('rental');
    document.getElementById('veh-is-test').value = 'false';
    updateTestUI(false);
    
    document.getElementById('btn-save-veh').textContent = 'PRIDĖTI Į GARAŽĄ';
    document.getElementById('garage-modal-title').textContent = 'GARAŽO VALDYMAS';
}

// ────────────────────────────────────────────────────────────────
// SAVE / UPDATE
// ────────────────────────────────────────────────────────────────

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name').value.trim();
    if (!name) return showToast('Įveskite pavadinimą', 'error');

    state.loading = true;
    try {
        const payload = {
            name: name,
            type: document.getElementById('veh-type').value,
            operating_cost_weekly: parseFloat(document.getElementById('veh-cost').value) || 0,
            carwash_monthly_cost: parseFloat(document.getElementById('veh-carwash').value) || 0,
            is_test: document.getElementById('veh-is-test').value === 'true',
            user_id: state.user.id,
            is_active: true
        };

        const { error } = editingId 
            ? await db.from('vehicles').update(payload).eq('id', editingId)
            : await db.from('vehicles').insert(payload);

        if (error) throw error;

        showToast(editingId ? 'Automobilis atnaujintas' : 'Automobilis pridėtas', 'success');
        resetForm();
        await fetchFleet();
        renderGarageList();
        if (window.closeModals) window.closeModals();
        
    } catch (e) { 
        showToast('Klaida: ' + e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// DELETE LOGIC (Detailed with different modal texts)
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

    state.loading = true;
    try {
        if (vehicle.is_test) {
            // Testinį triname visiškai
            await db.from('expenses').delete().eq('vehicle_id', pendingDeleteId);
            await db.from('finance_shifts').delete().eq('vehicle_id', pendingDeleteId);
            await db.from('vehicles').delete().eq('id', pendingDeleteId);
            showToast('Bandomasis automobilis ištrintas', 'success');
        } else {
            // Tikrą tik archyvuojame
            const { error } = await db.from('vehicles').update({ is_active: false }).eq('id', pendingDeleteId);
            if (error) throw error;
            showToast('Automobilis archyvuotas', 'success');
        }
        
        await fetchFleet();
        renderGarageList();
        if (window.closeModals) window.closeModals();
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
// UI RENDERING
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
        const cost = v.operating_cost_weekly || 0;
        const wash = v.carwash_monthly_cost || 0;
        const isTest = v.is_test;

        const borderClass = isTest ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/10 bg-white/5';
        const badge = isTest ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500 text-black ml-2">TEST</span>` : '';

        return `
        <div class="flex items-center justify-between p-3 mb-2 rounded-xl border ${borderClass}">
            <div class="text-left">
                <div class="flex items-center font-bold">
                    ${safeName} ${badge}
                </div>
                <div class="text-[10px] opacity-60 uppercase mt-1">
                    ${v.type} • $${cost}/wk • 🧼 $${wash}/mo
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="editVehicle('${v.id}')" class="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center active:scale-95 transition-transform">
                    <i class="fa-solid fa-pen-to-square text-xs"></i>
                </button>
                <button onclick="deleteVehicle('${v.id}')" class="h-8 w-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center active:scale-95 transition-transform">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

export function setVehType(type) {
    vibrate();
    document.getElementById('veh-type').value = type;
    document.querySelectorAll('.veh-type-btn').forEach(b => b.classList.toggle('active', b.id === `btn-type-${type}`));
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
    if (!btn || !dot) return;
    
    if (active) {
        btn.className = "cursor-pointer border border-yellow-500 bg-yellow-500/10 rounded-lg p-3 flex items-center justify-between transition-all";
        dot.className = "w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]";
    } else {
        btn.className = "cursor-pointer border border-gray-700 opacity-60 rounded-lg p-3 flex items-center justify-between transition-all hover:opacity-100";
        dot.className = "w-3 h-3 rounded-full bg-gray-600";
    }
}



__________________________
Naujas update 

// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE MODULE v2.0.1
// Logic: Full Odometer & CarWash Persistence
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let editingId = null;
let pendingDeleteId = null;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export async function fetchFleet() {
    try {
        const { data } = await db.from('vehicles').select('*').eq('user_id', state.user.id).eq('is_active', true).order('created_at', { ascending: false });
        state.fleet = data || [];
    } catch (e) { showToast('Garažo klaida', 'error'); }
}

export function openGarage() { vibrate(); resetForm(); renderGarageList(); window.openModal('garage-modal'); }

export function resetForm() {
    editingId = null;
    ['veh-name', 'veh-cost', 'veh-carwash', 'veh-year', 'veh-initial-odo'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    setVehType('rental');
    document.getElementById('veh-is-test').value = 'false';
    updateTestUI(false);
    document.getElementById('btn-save-veh').textContent = 'PRIDĖTI Į GARAŽĄ';
}

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name')?.value.trim();
    if (!name) return showToast('Įveskite pavadinimą', 'error');

    state.loading = true;
    try {
        const payload = {
            name: name,
            type: document.getElementById('veh-type').value,
            operating_cost_weekly: parseFloat(document.getElementById('veh-cost').value) || 0,
            carwash_monthly_cost: parseFloat(document.getElementById('veh-carwash').value) || 0,
            year: parseInt(document.getElementById('veh-year')?.value) || null,
            initial_odometer: parseInt(document.getElementById('veh-initial-odo')?.value) || 0,
            is_test: document.getElementById('veh-is-test').value === 'true',
            user_id: state.user.id, is_active: true
        };

        if (editingId) await db.from('vehicles').update(payload).eq('id', editingId);
        else await db.from('vehicles').insert(payload);

        showToast('Garažas atnaujintas!', 'success');
        resetForm(); await fetchFleet(); renderGarageList(); window.closeModals();
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;
    if (state.fleet.length === 0) { list.innerHTML = '<div class="text-center py-6 opacity-30 text-xs uppercase tracking-widest">Garažas tuščias</div>'; return; }

    list.innerHTML = state.fleet.map(v => `
        <div class="flex items-center justify-between p-3 mb-2 rounded-xl border border-white/10 bg-white/5">
            <div class="text-left">
                <div class="font-bold uppercase tracking-tight">${escapeHtml(v.name)} ${v.is_test ? '🧪' : ''}</div>
                <div class="text-[9px] opacity-50 uppercase mt-1">
                    $${v.operating_cost_weekly}/wk • 🧼 $${v.carwash_monthly_cost}/mo
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="editVehicle('${v.id}')" class="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center active:scale-95 transition-transform">
                    <i class="fa-solid fa-pen text-[10px]"></i>
                </button>
                <button onclick="deleteVehicle('${v.id}')" class="h-8 w-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center active:scale-95 transition-transform">
                    <i class="fa-solid fa-trash text-[10px]"></i>
                </button>
            </div>
        </div>
    `).join('');
}

window.editVehicle = (id) => {
    const v = state.fleet.find(x => x.id === id); if (!v) return;
    editingId = id;
    document.getElementById('veh-name').value = v.name;
    document.getElementById('veh-cost').value = v.operating_cost_weekly;
    document.getElementById('veh-carwash').value = v.carwash_monthly_cost;
    document.getElementById('veh-year').value = v.year || '';
    document.getElementById('veh-initial-odo').value = v.initial_odometer || '';
    setVehType(v.type);
    document.getElementById('btn-save-veh').textContent = 'ATNAUJINTI DUOMENIS';
    document.getElementById('garage-modal-title').textContent = 'REDAGUOTI';
};

export function setVehType(type) {
    vibrate();
    document.getElementById('veh-type').value = type;
    document.querySelectorAll('.veh-type-btn').forEach(b => b.classList.toggle('active', b.id === `btn-type-${type}`));
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
        btn?.classList.add('border-yellow-500', 'bg-yellow-500/10');
        dot?.classList.add('bg-yellow-400', 'shadow-[0_0_8px_rgba(250,204,21,0.8)]');
    } else {
        btn?.classList.remove('border-yellow-500', 'bg-yellow-500/10');
        dot?.classList.remove('bg-yellow-400', 'shadow-[0_0_8px_rgba(250,204,21,0.8)]');
    }
}

window.deleteVehicle = async (id) => {
    vibrate();
    if (!confirm('Tikrai pašalinti šį automobilį iš garažo?')) return;
    state.loading = true;
    try {
        await db.from('vehicles').update({ is_active: false }).eq('id', id);
        await fetchFleet();
        renderGarageList();
        showToast('Automobilis pašalintas', 'info');
    } catch (e) { showToast('Klaida šalinant', 'error'); }
    finally { state.loading = false; }
};
