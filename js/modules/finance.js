// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v1.8.1 (DELETE FIX)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

/* ────────────────────────────────────────────────────────────────
   INTERNAL STATE
---------------------------------------------------------------- */

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = []; // Saugosime ką trinti

/* ────────────────────────────────────────────────────────────────
   WINDOW BINDINGS (SVARBU: TIESIAI ČIA)
   Tai garantuoja, kad HTML mygtukai ras šias funkcijas.
---------------------------------------------------------------- */

window.openTxModal = (dir) => {
    vibrate();
    txDraft.direction = dir;
    txDraft.category = dir === 'in' ? 'tips' : 'fuel';
    updateTxModalUI(dir);
    const inp = document.getElementById('tx-amount');
    if(inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
    if(window.openModal) window.openModal('tx-modal');
};

window.setExpType = (cat, el) => {
    vibrate();
    txDraft.category = cat;
    updateCategoryUI(cat, el);
};

window.toggleSelectAll = () => {
    const master = document.getElementById('select-all-logs');
    document.querySelectorAll('.log-checkbox').forEach(b => b.checked = master.checked);
    updateDeleteButtonLocal();
};

// 1. PASPAUDUS "ŠIUKŠLIADĖŽĘ" (Atidaro modalą)
window.requestDelete = () => {
    vibrate();
    const checked = document.querySelectorAll('.log-checkbox:checked');
    
    // Surenkame duomenis iš checkbox'ų value="type:id"
    itemsToDelete = Array.from(checked).map(el => {
        const parts = el.value.split(':');
        return { type: parts[0], id: parts[1] };
    });

    if (itemsToDelete.length === 0) return;
    
    // Atnaujiname skaičių modale
    const countEl = document.getElementById('del-modal-count');
    if(countEl) countEl.textContent = itemsToDelete.length;
    
    if (window.openModal) window.openModal('delete-modal');
};

// 2. PASPAUDUS "DELETE" MODALE (Vykdo trynimą)
window.confirmDelete = async () => {
    vibrate([20]);
    if (itemsToDelete.length === 0) return window.closeModals();
    
    state.loading = true;
    try {
        const shiftIds = itemsToDelete.filter(i => i.type === 'shift').map(i => i.id);
        const txIds = itemsToDelete.filter(i => i.type === 'tx').map(i => i.id);

        // Triname pamainas
        if (shiftIds.length > 0) {
            await db.from('expenses').delete().in('shift_id', shiftIds);
            await db.from('finance_shifts').delete().in('id', shiftIds);
        }

        // Triname pavienes operacijas
        if (txIds.length > 0) {
            await db.from('expenses').delete().in('id', txIds);
        }

        showToast(`${itemsToDelete.length} įrašai ištrinti`, 'success');
        itemsToDelete = []; // Išvalome
        
        if (window.closeModals) window.closeModals();
        refreshAudit(); // Perkrauname sąrašą
        window.dispatchEvent(new Event('refresh-data'));

    } catch (e) {
        console.error(e);
        showToast('Klaida trinant: ' + e.message, 'error');
    } finally {
        state.loading = false;
    }
};

window.confirmTx = async () => {
    vibrate([20]);
    const amountEl = document.getElementById('tx-amount');
    const amount = amountEl ? parseFloat(amountEl.value) : 0;
    if (!amount || amount <= 0) return showToast('Įvesk sumą', 'error');

    state.loading = true;
    try {
        let meta = {};
        if (txDraft.category === 'fuel') {
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            if (gal) meta.gallons = parseFloat(gal);
            if (odo) meta.odometer = parseInt(odo);
        }
        await recordTransaction(txDraft.direction === 'in' ? 'income' : 'expense', {
            amount, category: txDraft.category, meta
        });
        if (window.closeModals) window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (err) {
        showToast('Klaida: ' + err.message, 'error');
    } finally {
        state.loading = false;
    }
};

window.exportAI = () => showToast('AI Export: Coming Soon', 'info');

/* ────────────────────────────────────────────────────────────────
   INTERNAL LOGIC
---------------------------------------------------------------- */

function updateTxModalUI(dir) {
    const title = document.getElementById('tx-title');
    if (title) title.textContent = dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';
    
    document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
    document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');
    document.getElementById('fuel-fields')?.classList.add('hidden');
    
    document.querySelectorAll('.inc-btn, .exp-btn').forEach(b => {
        b.classList.remove('active', 'border-gray-800');
    });
}

function updateCategoryUI(cat, el) {
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
    if (el) { el.classList.add('active'); el.classList.remove('border-gray-800'); }
    
    const fuel = document.getElementById('fuel-fields');
    if(fuel) fuel.classList.toggle('hidden', cat !== 'fuel');
}

async function recordTransaction(type, { amount, category, meta }) {
    if (!state.user?.id) throw new Error('Vartotojas nerastas');
    const shiftId = state.activeShift?.id ?? null;
    const vehicleId = state.activeShift?.vehicle_id ?? null;

    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: shiftId,
        vehicle_id: vehicleId,
        type, category, amount, ...meta,
        created_at: new Date().toISOString()
    });
    if (error) throw error;

    if (shiftId) {
        const delta = type === 'income' ? amount : -amount;
        const { data } = await db.from('finance_shifts').select('gross_earnings').eq('id', shiftId).single();
        if (data) await db.from('finance_shifts').update({ gross_earnings: (data.gross_earnings || 0) + delta }).eq('id', shiftId);
    }
    showToast(`${type === 'income' ? '+' : '-'}$${amount.toFixed(2)} įrašyta`, 'success');
}

/* ────────────────────────────────────────────────────────────────
   AUDIT LIST RENDERER
---------------------------------------------------------------- */

export async function refreshAudit() {
    const listEl = document.getElementById('audit-list');
    if (!state.user?.id) return;

    try {
        // 1. Pamainos
        const { data: shifts } = await db.from('finance_shifts')
            .select('*').eq('user_id', state.user.id).order('start_time', { ascending: false }).limit(30);

        // 2. Pavienės operacijos
        const { data: txs } = await db.from('expenses')
            .select('*').eq('user_id', state.user.id).is('shift_id', null).order('created_at', { ascending: false }).limit(30);

        // 3. Sujungiam
        const combined = [
            ...(shifts || []).map(s => ({ ...s, _kind: 'shift', _date: new Date(s.start_time) })),
            ...(txs || []).map(t => ({ ...t, _kind: 'tx', _date: new Date(t.created_at) }))
        ].sort((a, b) => b._date - a._date);

        renderAuditList(combined);

    } catch (e) {
        console.error(e);
        if(listEl) listEl.innerHTML = '<div class="py-10 text-center text-red-500">Klaida kraunant</div>';
    }
}

function renderAuditList(items) {
    const listEl = document.getElementById('audit-list');
    if (!listEl) return;
    
    // Reset checkbox master
    const master = document.getElementById('select-all-logs');
    if (master) master.checked = false;
    updateDeleteButtonLocal();

    if (!items || items.length === 0) {
        listEl.innerHTML = `<div class="py-10 text-center opacity-50 text-xs uppercase">Nėra istorijos</div>`;
        return;
    }

    listEl.innerHTML = items.map(item => {
        const dateObj = item._date;
        const date = dateObj.toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit' });
        const time = dateObj.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
        
        let icon, title, valueVal, colorClass;

        if (item._kind === 'shift') {
            icon = 'fa-clock';
            title = 'Pamaina';
            const earn = item.gross_earnings || 0;
            valueVal = `${earn >= 0 ? '+' : ''}$${earn.toFixed(2)}`;
            colorClass = item.status === 'active' ? 'text-teal-500 animate-pulse' : (earn < 0 ? 'text-red-400' : 'text-green-500');
        } else {
            title = item.category.toUpperCase();
            const amount = item.amount;
            if (item.type === 'income') {
                icon = 'fa-arrow-down';
                valueVal = `+$${amount.toFixed(2)}`;
                colorClass = 'text-green-500';
            } else {
                icon = 'fa-arrow-up';
                valueVal = `-$${amount.toFixed(2)}`;
                colorClass = 'text-red-400';
            }
        }

        // GENERUOJAME UNIKALŲ VALUE: "tipas:id"
        const checkboxValue = `${item._kind}:${item.id}`;

        return `
        <div class="log-card flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5 mb-2">
            <div class="flex gap-3 items-center">
                <input type="checkbox" class="log-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 text-teal-500 focus:ring-0" 
                       value="${checkboxValue}">
                
                <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs opacity-70">
                    <i class="fa-solid ${icon}"></i>
                </div>
                
                <div>
                    <div class="text-[10px] opacity-50 uppercase tracking-wide">${date} • ${title}</div>
                    <div class="text-sm font-bold text-white">${time}</div>
                </div>
            </div>
            <div class="font-mono font-bold ${colorClass}">${valueVal}</div>
        </div>`;
    }).join('');

    // Pridedame event listeners rankiniu būdu
    document.querySelectorAll('.log-checkbox').forEach(box => {
        box.addEventListener('change', updateDeleteButtonLocal);
    });
}

function updateDeleteButtonLocal() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    const count = document.getElementById('delete-count');
    
    if (btn && count) {
        count.textContent = checked.length;
        if (checked.length > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
}
