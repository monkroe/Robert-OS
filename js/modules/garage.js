import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// --- DATA ---
export async function fetchFleet() {
    const { data } = await db.from('vehicles').select('*').eq('is_active', true);
    state.fleet = data || [];
}

// --- ACTIONS ---
export function openGarage() {
    vibrate();
    document.getElementById('veh-name').value = '';
    document.getElementById('veh-cost').value = '';
    setVehType('rental');
    
    // SVARBU: Sugeneruojame sąrašą atidarant modalą
    renderGarageList();
    
    document.getElementById('garage-modal').classList.remove('hidden');
}

export function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;

    if (state.fleet.length === 0) {
        list.innerHTML = '<p class="text-xs text-gray-500 italic text-center py-4">Garažas tuščias</p>';
        return;
    }

    // ČIA YRA GENERUOJAMAS TRYNIMO MYGTUKAS
    list.innerHTML = state.fleet.map(v => `
        <div class="flex justify-between items-center bg-gray-900/50 p-3 rounded-xl border border-gray-800 mb-2">
            <div>
                <p class="text-sm font-bold text-white">${v.name}</p>
                <p class="text-[10px] text-gray-500 uppercase">${v.type} • $${v.operating_cost_weekly}/wk</p>
            </div>
            <button onclick="window.deleteVehicle('${v.id}')" class="w-8 h-8 flex items-center justify-center bg-red-500/10 text-red-500 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-colors">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
}

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name').value;
    const cost = document.getElementById('veh-cost').value;
    const type = document.getElementById('veh-type').value;

    if (!name) return showToast('Reikia pavadinimo', 'error');

    state.loading = true;
    try {
        const { error } = await db.from('vehicles').insert({
            user_id: state.user.id,
            name: name,
            type: type,
            operating_cost_weekly: parseFloat(cost || 0),
            is_active: true
        });
        if (error) throw error;
        
        showToast('Mašina pridėta!', 'success');
        document.getElementById('veh-name').value = '';
        document.getElementById('veh-cost').value = '';
        
        await fetchFleet();
        renderGarageList();
    } catch (e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function deleteVehicle(id) {
    vibrate([20]);
    if(!confirm('Ar tikrai nori ištrinti?')) return;

    state.loading = true;
    try {
        const { error } = await db.from('vehicles').delete().eq('id', id);
        if (error) throw error;
        
        showToast('Mašina ištrinta', 'success');
        await fetchFleet();
        renderGarageList();
    } catch (e) {
        showToast('Nepavyko ištrinti (Check Permissions)', 'error');
    } finally {
        state.loading = false;
    }
}

export function setVehType(type) {
    vibrate();
    document.getElementById('veh-type').value = type;
    document.querySelectorAll('.veh-type-btn').forEach(b => {
        b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500', 'opacity-100');
        b.classList.add('opacity-50');
    });
    const activeBtn = document.getElementById(`btn-type-${type}`);
    if(activeBtn) {
        activeBtn.classList.remove('opacity-50');
        activeBtn.classList.add('bg-teal-500', 'text-black', 'border-teal-500', 'opacity-100');
    }
}
