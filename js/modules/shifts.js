// ════════════════════════════════════════════════════════════════
// ROBERT OS - SHIFTS.JS v1.7.5 (SHIFT TRACKER)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast } from '../utils.js';

export const actions = {
    'start': async () => {
        try {
            const { data: { user } } = await db.auth.getUser();
            const { error } = await db.from('shifts').insert([{ 
                user_id: user.id, 
                status: 'active', 
                start_time: new Date().toISOString() 
            }]);
            if (error) throw error;
            showToast('Pamaina pradėta', 'success');
            await loadActive();
        } catch (err) {
            showToast('Klaida: ' + err.message, 'error');
        }
    }
};

export async function loadActive() {
    const widget = document.getElementById('shifts-widget');
    if (!widget) return;
    try {
        const { data, error } = await db.from('shifts').select('*').eq('status', 'active').maybeSingle();
        if (error) throw error;
        state.activeShift = data;
        render(widget, data);
    } catch (err) {
        widget.innerHTML = '<div class="text-red-500 text-[10px] p-4 uppercase">Pamainų klaida</div>';
    }
}

function render(container, active) {
    container.innerHTML = `
        <h3 class="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-4 italic">Pamainos</h3>
        ${active ? `
            <div class="p-4 bg-teal-500/5 border border-teal-500/20 rounded-2xl">
                <p class="text-teal-500 font-black text-xs italic tracking-widest">AKTYVI PAMAINA</p>
                <p class="text-[10px] text-white/40 mt-2 uppercase font-mono">${new Date(active.start_time).toLocaleTimeString('lt-LT')}</p>
            </div>
        ` : `
            <button data-action="shifts:start" class="w-full py-4 bg-teal-500 text-black font-black text-[10px] rounded-2xl italic tracking-widest">PRADĖTI DARBĄ</button>
        `}
    `;
}
