// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE MODULE v1.5.0 (FINAL)
// Fleet Management with Year & Initial Odometer
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// XSS PROTECTION
// ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// DATA
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
        console.log(`🚗 Loaded ${state.fleet.length} vehicles`);
        
    } catch (error) {
        console.error('Error fetching fleet:', error);
        showToast('<i class="fa-solid fa-triangle-exclamation"></i> Nepavyko užkrauti garažo', 'error');
        state.fleet = [];
    }
}

// ────────────────────────────────────────────────────────────────
// ACTIONS
// ────────────────────────────────────────────────────────────────

export function openGarage() {
    vibrate();
    
    document.getElementById('veh-name').value = '';
    document.getElementById('veh-year').value = '';
    document.getElementById('veh-initial-odo').value = '';
    document.getElementById('veh-cost').value = '';
    setVehType('rental');

    renderGarageList();
    document.getElementById('garage-modal').classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// RENDER LIST
// ────────────────────────────────────────────────────────────────

export function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;

    if (state.fleet.length === 0) {
        list.innerHTML = '<div class="text-center py-6"><p class="text-xs text-gray-500 uppercase tracking-widest">Garažas tuščias</p></div>';
        return;
    }

    list.innerHTML = state.fleet.map(v => {
        const safeName = escapeHtml(v.name);
        const typeLabel = v.type === 'rental' ? '🚖 Bandomasis' : '🚘 Nuosavas';
        const safeCost = escapeHtml(v.operating_cost_weekly || 0);
        const yearInfo = v.year ? ` (${v.year})` : '';
        const currentOdo = v.last_odo || v.initial_odometer || 0;
        
        return `
        <div class="group relative flex items-center justify-between p-4 mb-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 transition-all">
            <div class="flex flex-col text-left">
                <div class="flex items-center">
                    <span class="text-base font-bold text-gray-900 dark:text-white tracking-tight">${safeName}${yearInfo}</span>
                </div>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 uppercase">${typeLabel}</span>
                    <span class="text-[10px] text-gray-500 dark:text-gray-400 font-mono">$${safeCost}/sav</span>
                    ${currentOdo ? `<span class="text-[10px] text-gray-400 font-mono border-l border-white/10 pl-2">Rida: ${currentOdo}</span>` : ''}
                </div>
            </div>
            <button onclick="window.deleteVehicle('${v.id}')" 
                class="h-10 w-10 flex items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-500 border border-red-500/20 active:scale-95 transition-transform">
                <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
        </div>
    `}).join('');
}

// ────────────────────────────────────────────────────────────────
// SAVE VEHICLE
// ────────────────────────────────────────────────────────────────

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name').value.trim();
    const year = document.getElementById('veh-year').value.trim();
    const initialOdo = document.getElementById('veh-initial-odo').value.trim();
    const cost = document.getElementById('veh-cost').value;
    const type = document.getElementById('veh-type').value;

    if (!name) return showToast('<i class="fa-solid fa-triangle-exclamation"></i> Reikia pavadinimo', 'error');

    state.loading = true;
    try {
        const vehicleData = {
            user_id: state.user.id,
            name: name,
            type: type,
            operating_cost_weekly: parseFloat(cost || 0),
            is_active: true
        };
        
        if (year) {
            vehicleData.year = parseInt(year);
        }
        
        if (initialOdo) {
            vehicleData.initial_odometer = parseInt(initialOdo);
            vehicleData.last_odo = parseInt(initialOdo);
        }
        
        const { error } = await db.from('vehicles').insert(vehicleData);
        
        if (error) throw error;
        
        const icon = type === 'rental' ? '🚖' : '🚘';
        const label = type === 'rental' ? 'Bandomasis' : 'Nuosavas';
        showToast(`${icon} ${label} automobilis pridėtas!`, 'success');
        
        document.getElementById('veh-name').value = '';
        document.getElementById('veh-year').value = '';
        document.getElementById('veh-initial-odo').value = '';
        document.getElementById('veh-cost').value = '';
        
        await fetchFleet();
        renderGarageList();
        
    } catch (e) { 
        showToast(`<i class="fa-solid fa-triangle-exclamation"></i> ${e.message}`, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// DELETE VEHICLE
// ────────────────────────────────────────────────────────────────

let pendingDeleteId = null;

export async function deleteVehicle(id) {
    vibrate([20]);
    const vehicle = state.fleet.find(v => v.id === id);
    if (!vehicle) return;
    
    pendingDeleteId = id;
    
    const confirmModal = document.getElementById('delete-vehicle-modal');
    if (confirmModal) {
        const titleEl = confirmModal.querySelector('#delete-vehicle-title');
        const messageEl = confirmModal.querySelector('#delete-vehicle-message');
        const iconEl = confirmModal.querySelector('#delete-vehicle-icon');
        
        const typeLabel = vehicle.type === 'rental' ? '🚖 bandomąjį' : '🚘 nuosavą';
        
        if (titleEl) titleEl.textContent = 'Pašalinti automobilį?';
        if (messageEl) messageEl.innerHTML = `Ar tikrai norite pašalinti ${typeLabel} automobilį <strong>${escapeHtml(vehicle.name)}</strong>?<br>Jei turi istoriją - bus archyvuotas.`;
        if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-car"></i>';
        
        confirmModal.classList.remove('hidden');
    } else {
        if (!confirm('Pašalinti automobilį?')) {
            pendingDeleteId = null;
            return;
        }
        await executeDelete(id);
    }
}

export async function confirmDeleteVehicle() {
    if (!pendingDeleteId) return;
    
    window.closeModals();
    await executeDelete(pendingDeleteId);
    pendingDeleteId = null;
}

export function cancelDeleteVehicle() {
    vibrate();
    pendingDeleteId = null;
    window.closeModals();
}

async function executeDelete(id) {
    state.loading = true;
    try {
        const { error } = await db.from('vehicles').delete().eq('id', id);
        
        if (error && error.code === '23503') {
            await db.from('vehicles').update({ is_active: false }).eq('id', id);
            showToast('<i class="fa-solid fa-box-archive"></i> Automobilis archyvuotas', 'success');
        } else if (error) {
            throw error;
        } else {
            showToast('<i class="fa-solid fa-trash"></i> Automobilis ištrintas', 'success');
        }
        
        await fetchFleet();
        renderGarageList();
        
    } catch (e) { 
        showToast(`<i class="fa-solid fa-triangle-exclamation"></i> ${e.message}`, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// VEHICLE TYPE
// ────────────────────────────────────────────────────────────────

export function setVehType(type) {
    vibrate();
    document.getElementById('veh-type').value = type;
    
    document.querySelectorAll('.veh-type-btn').forEach(b => {
        b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500', 'opacity-100');
        b.classList.add('opacity-50');
    });
    
    const activeBtn = document.getElementById(`btn-type-${type}`);
    if (activeBtn) {
        activeBtn.classList.remove('opacity-50');
        activeBtn.classList.add('bg-teal-500', 'text-black', 'border-teal-500', 'opacity-100');
    }
}
