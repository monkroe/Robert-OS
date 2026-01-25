// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE MODULE v1.5.3
// Fleet Management with Bandomasis/Nuosavas Logic
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
        console.log(`🚗 Garažas užkrautas: ${state.fleet.length} vnt.`);
        
    } catch (error) {
        console.error('Error fetching fleet:', error);
        showToast('Nepavyko užkrauti garažo', 'error');
        state.fleet = [];
    }
}

// ────────────────────────────────────────────────────────────────
// ACTIONS
// ────────────────────────────────────────────────────────────────

export function openGarage() {
    vibrate();
    
    // Išvalome formą prieš atidarant
    document.getElementById('veh-name').value = '';
    document.getElementById('veh-cost').value = '';
    document.getElementById('veh-year').value = '';
    document.getElementById('veh-initial-odo').value = '';
    
    setVehType('rental');
    
    document.getElementById('veh-is-test').value = 'false';
    updateTestUI(false);

    renderGarageList();
    document.getElementById('garage-modal').classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// BANDOMASIS MODE (is_test)
// ────────────────────────────────────────────────────────────────

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
        const safeType = escapeHtml(v.type);
        const safeCost = v.operating_cost_weekly || 0;
        const currentOdo = v.last_odo || v.initial_odometer || 0;
        
        const isTest = v.is_test;
        const borderClass = isTest 
            ? 'border-yellow-500/50 bg-yellow-500/5' 
            : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5';
            
        const badge = isTest 
            ? `<span class="text-[10px] font-bold px-2 py-1 rounded bg-yellow-400 text-black uppercase ml-2 shadow-sm"><i class="fa-solid fa-taxi mr-1"></i>BANDOMASIS</span>` 
            : '';

        return `
        <div class="group relative flex items-center justify-between p-4 mb-3 rounded-xl border ${borderClass} transition-all">
            <div class="flex flex-col text-left">
                <div class="flex items-center">
                    <span class="text-base font-bold text-gray-900 dark:text-white tracking-tight">${safeName}</span>
                    ${v.year ? `<span class="ml-2 text-[10px] bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-500 font-mono">${v.year}</span>` : ''}
                    ${badge}
                </div>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 uppercase">${safeType === 'rental' ? 'Nuoma' : 'Nuosavas'}</span>
                    <span class="text-[10px] text-gray-500 dark:text-gray-400 font-mono">$${safeCost}/sav</span>
                    <span class="text-[10px] text-gray-400 font-mono border-l border-white/10 pl-2">Rida: ${currentOdo}</span>
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
    const cost = document.getElementById('veh-cost').value;
    const year = document.getElementById('veh-year').value; // ✅ NAUJAS
    const initialOdo = document.getElementById('veh-initial-odo').value; // ✅ NAUJAS
    const type = document.getElementById('veh-type').value;
    const isTest = document.getElementById('veh-is-test').value === 'true';

    if (!name) return showToast('Reikia pavadinimo', 'error');

    state.loading = true;
    try {
        const { error } = await db.from('vehicles').insert({
            user_id: state.user.id,
            name: name,
            type: type,
            operating_cost_weekly: parseFloat(cost || 0),
            year: year ? parseInt(year) : null, // ✅ Išsaugome
            initial_odometer: initialOdo ? parseInt(initialOdo) : 0, // ✅ Išsaugome
            last_odo: initialOdo ? parseInt(initialOdo) : 0,
            is_active: true,
            is_test: isTest
        });
        
        if (error) throw error;
        
        showToast(isTest ? '🚖 Bandomasis automobilis sukurtas' : '🚘 Automobilis pridėtas!', 'success');
        
        // Išvalome formą
        document.getElementById('veh-name').value = '';
        document.getElementById('veh-cost').value = '';
        document.getElementById('veh-year').value = '';
        document.getElementById('veh-initial-odo').value = '';
        document.getElementById('veh-is-test').value = 'false';
        updateTestUI(false);
        
        await fetchFleet();
        renderGarageList();
        
    } catch (e) { 
        showToast(e.message, 'error'); 
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
    const isTest = vehicle.is_test;
    
    const confirmModal = document.getElementById('delete-vehicle-modal');
    if (confirmModal) {
        const titleEl = confirmModal.querySelector('#delete-vehicle-title');
        const messageEl = confirmModal.querySelector('#delete-vehicle-message');
        const iconEl = confirmModal.querySelector('#delete-vehicle-icon');
        
        if (isTest) {
            titleEl.textContent = 'Pašalinti bandomąjį?';
            messageEl.innerHTML = `Automobilis <strong>${escapeHtml(vehicle.name)}</strong> yra bandomasis.<br>Bus ištrinti visi su juo susiję duomenys.`;
            iconEl.innerHTML = '<i class="fa-solid fa-taxi text-yellow-500"></i>';
        } else {
            titleEl.textContent = 'Pašalinti automobilį?';
            messageEl.innerHTML = `Ar tikrai norite pašalinti <strong>${escapeHtml(vehicle.name)}</strong>?<br>Istorija bus išsaugota archyve.`;
            iconEl.innerHTML = '<i class="fa-solid fa-car"></i>';
        }
        
        confirmModal.classList.remove('hidden');
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
            await db.from('expenses').delete().eq('vehicle_id', id);
            await db.from('finance_shifts').delete().eq('vehicle_id', id);
            await db.from('vehicles').delete().eq('id', id);
            showToast('🧹 Bandomojo automobilio duomenys išvalyti', 'success');
        } else {
            const { error } = await db.from('vehicles').delete().eq('id', id);
            
            if (error && error.code === '23503') {
                await db.from('vehicles').update({ is_active: false }).eq('id', id);
                showToast('📦 Automobilis perkeltas į archyvą', 'success');
            } else if (error) {
                throw error;
            } else {
                showToast('🗑️ Automobilis pašalintas', 'success');
            }
        }
        await fetchFleet();
        renderGarageList();
    } catch (e) { 
        showToast('Klaida: ' + e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// Global exposure
window.deleteVehicle = deleteVehicle;
window.confirmDeleteVehicle = confirmDeleteVehicle;
window.cancelDeleteVehicle = cancelDeleteVehicle;

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
