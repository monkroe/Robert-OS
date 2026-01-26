// ════════════════════════════════════════════════════════════════
// ROBERT OS - GARAGE.JS v1.7.5 (FLEET MANAGER)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

export const actions = {
    'add-vehicle': () => console.log('Pridėti automobilį v1.7.5')
};

export async function loadFleet() {
    const widget = document.getElementById('fleet-widget');
    if (!widget) return;

    try {
        const { data, error } = await db.from('fleet').select('*').order('name');
        if (error) throw error;
        state.fleet = data || [];
        render(widget, state.fleet);
    } catch (err) {
        widget.innerHTML = '<div class="text-red-500 text-[10px] p-4 uppercase">Garažo klaida</div>';
    }
}

function render(container, fleet) {
    container.innerHTML = `
        <h3 class="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-4 italic">Garažas (${fleet.length})</h3>
        <div class="space-y-2">
            ${fleet.length ? fleet.map(car => `
                <div class="flex justify-between items-center p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
                    <span class="font-bold text-sm tracking-tighter italic">${car.name}</span>
                    <span class="text-[10px] px-2 py-1 bg-teal-500/10 text-teal-500 rounded-md font-mono">${car.plate || '-'}</span>
                </div>
            `).join('') : '<p class="text-white/20 text-[10px] italic">Garažas tuščias</p>'}
        </div>
    `;
}
