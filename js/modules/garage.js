// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE.JS v1.2.0 (DATA SYNC FIXED)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

export const actions = {
    'add-vehicle': () => console.log('Pridėti automobilį...')
};

export async function loadFleet() {
    const widget = document.getElementById('fleet-widget');
    if (!widget) return;

    try {
        console.log('🚛 Kraunamas automobilių parkas...');
        
        // 1. UŽKLAUSA Į SUPABASE
        // Svarbu: Įsitikink, kad lentelė 'fleet' egzistuoja tavo DB
        const { data, error } = await db
            .from('fleet')
            .select('*')
            .order('name');

        if (error) throw error;

        // 2. STATE ATNAUJINIMAS
        state.fleet = data || [];

        // 3. UI ATNAUJINIMAS
        renderFleet(widget, state.fleet);

    } catch (err) {
        console.error('❌ Garage Sync Error:', err);
        widget.innerHTML = `
            <div class="text-red-500 text-xs p-4 border border-red-500/20 rounded-xl bg-red-500/5">
                Nepavyko pasiekti 'fleet' lentelės. Patikrinkite RLS politikas.
            </div>
        `;
        // Perduodame klaidą į viršų, kad app.js parodytų Toast
        throw err; 
    }
}

function renderFleet(container, fleet) {
    if (fleet.length === 0) {
        container.innerHTML = `
            <div class="text-white/20 text-center">
                <p class="text-xs uppercase tracking-widest">Garažas tuščias</p>
                <button data-action="garage:add-vehicle" class="mt-4 text-teal-500 text-[10px] font-bold">+ PRIDĖTI</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="w-full">
            <h3 class="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-4">Garažas (${fleet.length})</h3>
            <div class="space-y-2">
                ${fleet.map(car => `
                    <div class="flex justify-between items-center p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all">
                        <span class="font-bold text-sm">${car.name}</span>
                        <span class="text-[10px] px-2 py-1 bg-teal-500/20 text-teal-500 rounded-md font-mono">${car.plate || 'N/A'}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
