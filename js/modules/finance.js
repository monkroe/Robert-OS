// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE.JS v1.7.5 (MONETARY SYSTEM)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';

export const actions = {
    'refresh': () => loadSettings()
};

export async function loadSettings() {
    const widget = document.getElementById('finance-widget');
    if (!widget) return;
    try {
        const { data, error } = await db.from('finance_settings').select('*').maybeSingle();
        if (error) throw error;
        state.finance = data || { balance: 0 };
        render(widget, state.finance);
    } catch (err) {
        widget.innerHTML = '<div class="text-red-500 text-[10px] p-4 uppercase">Finansų klaida</div>';
    }
}

function render(container, data) {
    container.innerHTML = `
        <h3 class="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-4 italic">Finansai</h3>
        <div class="mt-2">
            <div class="text-3xl font-black italic tracking-tighter text-white">€ ${data.balance?.toFixed(2) || '0.00'}</div>
            <p class="text-[10px] text-white/20 uppercase mt-1 italic tracking-widest font-bold">Likutis sąskaitoje</p>
        </div>
        <button data-action="finance:refresh" class="mt-6 text-[9px] text-white/20 hover:text-teal-500 transition-colors uppercase font-bold tracking-widest">Atnaujinti</button>
    `;
}
