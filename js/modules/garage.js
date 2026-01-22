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
    
    // Sugeneruojame sąrašą atidarant modalą
    renderGarageList();
    
    document.getElementById('garage-modal').classList.remove('hidden');
}

// ČIA PAKEISTAS DIZAINAS (renderGarageList)
export function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;

    if (state.fleet.length === 0) {
        list.innerHTML = '<div class="text-center py-6"><p class="text-xs text-gray-500 uppercase tracking-widest">Garažas tuščias</p></div>';
        return;
    }

    list.innerHTML = state.fleet.map(v => `
        <div class="group relative flex items-center justify-between p-4 mb-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all">
            
            <div class="flex flex-col text-left">
                <span class="text-base font-bold text-white tracking-tight">${v.name}</span>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 uppercase">${v.type}</span>
                    <span class="text-[10px] text-gray-400 font-mono">$${v.operating_cost_weekly}/wk</span>
                </div>
            </div>

            <button onclick="window.deleteVehicle('${v.id}')" 
                class="h-10 w-10 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 active:scale-95 transition-transform">
                <i class="fa-solid fa-trash-can text-sm"></i>
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
