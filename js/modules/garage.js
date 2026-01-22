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
    
    // Reset Test Mode
    document.getElementById('veh-is-test').value = 'false';
    updateTestUI(false);

    renderGarageList();
    document.getElementById('garage-modal').classList.remove('hidden');
}

// NAUJA: Test Mode Perjungiklis
window.toggleTestMode = function() {
    vibrate();
    const input = document.getElementById('veh-is-test');
    const isTest = input.value === 'true';
    input.value = !isTest;
    updateTestUI(!isTest);
}

function updateTestUI(isActive) {
    const btn = document.getElementById('btn-test-mode');
    const dot = document.getElementById('test-indicator');
    
    if (isActive) {
        btn.classList.remove('opacity-60', 'border-gray-700');
        btn.classList.add('opacity-100', 'border-yellow-500', 'bg-yellow-500/10');
        dot.classList.remove('bg-gray-700');
        dot.classList.add('bg-yellow-400', 'shadow-[0_0_10px_rgba(250,204,21,0.5)]');
    } else {
        btn.classList.add('opacity-60', 'border-gray-700');
        btn.classList.remove('opacity-100', 'border-yellow-500', 'bg-yellow-500/10');
        dot.classList.add('bg-gray-700');
        dot.classList.remove('bg-yellow-400', 'shadow-[0_0_10px_rgba(250,204,21,0.5)]');
    }
}

export function renderGarageList() {
    const list = document.getElementById('garage-list');
    if (!list) return;

    if (state.fleet.length === 0) {
        list.innerHTML = '<div class="text-center py-6"><p class="text-xs text-gray-500 uppercase tracking-widest">Garažas tuščias</p></div>';
        return;
    }

    list.innerHTML = state.fleet.map(v => {
        // Ar tai testinis automobilis?
        const isTest = v.is_test;
        const borderClass = isTest ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5';
        const badge = isTest 
            ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500 text-black uppercase ml-2"><i class="fa-solid fa-flask mr-1"></i>TEST</span>` 
            : '';

        return `
        <div class="group relative flex items-center justify-between p-4 mb-3 rounded-xl border ${borderClass} transition-all">
            
            <div class="flex flex-col text-left">
                <div class="flex items-center">
                    <span class="text-base font-bold text-gray-900 dark:text-white tracking-tight">${v.name}</span>
                    ${badge}
                </div>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 uppercase">${v.type}</span>
                    <span class="text-[10px] text-gray-500 dark:text-gray-400 font-mono">$${v.operating_cost_weekly}/wk</span>
                </div>
            </div>

            <button onclick="window.deleteVehicle('${v.id}')" 
                class="h-10 w-10 flex items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-500 border border-red-500/20 active:scale-95 transition-transform">
                <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
            
        </div>
    `}).join('');
}

export async function saveVehicle() {
    vibrate([20]);
    const name = document.getElementById('veh-name').value;
    const cost = document.getElementById('veh-cost').value;
    const type = document.getElementById('veh-type').value;
    const isTest = document.getElementById('veh-is-test').value === 'true'; // Skaitome reikšmę

    if (!name) return showToast('Reikia pavadinimo', 'error');

    state.loading = true;
    try {
        const { error } = await db.from('vehicles').insert({
            user_id: state.user.id,
            name: name,
            type: type,
            operating_cost_weekly: parseFloat(cost || 0),
            is_active: true,
            is_test: isTest // Įrašome į DB
        });
        if (error) throw error;
        
        showToast(isTest ? '🧪 Testinis automobilis sukurtas' : 'Automobilis pridėtas!', 'success');
        
        // Išvalyti formą
        document.getElementById('veh-name').value = '';
        document.getElementById('veh-cost').value = '';
        // Reset Test UI
        document.getElementById('veh-is-test').value = 'false';
        updateTestUI(false);
        
        await fetchFleet();
        renderGarageList();
    } catch (e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- IŠMANUSIS TRYNIMAS ---
export async function deleteVehicle(id) {
    vibrate([20]);

    // 1. Patikriname, ar tai TEST automobilis
    const vehicle = state.fleet.find(v => v.id === id);
    const isTest = vehicle?.is_test;

    // A. Jei TESTINIS - Triname greitai ir be gailesčio
    if (isTest) {
        if(!confirm('🧪 Tai TESTINIS automobilis. Ištrinti jį ir visus jo duomenis?')) return;
        state.loading = true;
        try {
            // Pirmiausia ištriname susijusias testines pamainas/išlaidas (kad nekiltų SQL klaidų)
            await db.from('expenses').delete().eq('vehicle_id', id);
            await db.from('finance_shifts').delete().eq('vehicle_id', id);
            // Tada patį automobilį
            await db.from('vehicles').delete().eq('id', id);
            
            showToast('Testiniai duomenys išvalyti 🧹', 'success');
            await fetchFleet();
            renderGarageList();
        } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
        return;
    }

    // B. Jei REALI - Saugome
    if(!confirm('Ar norite pašalinti šį automobilį?')) return;

    state.loading = true;
    try {
        const { error } = await db.from('vehicles').delete().eq('id', id);

        if (error) {
            if (error.code === '23503') { // Foreign Key Violation
                if (confirm('⚠️ Automobilis turi finansinę istoriją (Real Production). Negalima trinti.\n\nAr norite jį ARCHYVUOTI?')) {
                    await db.from('vehicles').update({ is_active: false }).eq('id', id);
                    showToast('Automobilis perkeltas į archyvą', 'success');
                } else {
                    state.loading = false;
                    return;
                }
            } else { throw error; }
        } else {
            showToast('Automobilis ištrintas visiškai', 'success');
        }
        
        await fetchFleet();
        renderGarageList();
    } catch (e) {
        console.error(e);
        showToast('Klaida: ' + e.message, 'error');
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
