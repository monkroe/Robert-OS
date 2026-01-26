// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v1.7.9 (HISTORY FIX)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

/* ────────────────────────────────────────────────────────────────
   INTERNAL STATE
---------------------------------------------------------------- */

let txDraft = {
    direction: 'in', // 'in' arba 'out'
    category: 'tips'
};
// Saugosime objektus: { id: '123', type: 'shift' | 'tx' }
let itemsToDelete = [];

/* ────────────────────────────────────────────────────────────────
   UI → CORE BRIDGE
---------------------------------------------------------------- */

export function openTxModal(direction) {
    vibrate();
    txDraft.direction = direction;
    txDraft.category = direction === 'in' ? 'tips' : 'fuel';

    updateTxModalUI(direction);
    
    const amountInput = document.getElementById('tx-amount');
    if (amountInput) {
        amountInput.value = '';
        setTimeout(() => amountInput.focus(), 100);
    }
    
    if (window.openModal) window.openModal('tx-modal');
}

export function setTxCategory(category, el) {
    vibrate();
    txDraft.category = category;
    updateCategoryUI(category, el);
}

/* ────────────────────────────────────────────────────────────────
   UI UPDATERS
---------------------------------------------------------------- */

function updateTxModalUI(direction) {
    const title = document.getElementById('tx-title');
    const incomeTypes = document.getElementById('income-types');
    const expenseTypes = document.getElementById('expense-types');
    const fuelFields = document.getElementById('fuel-fields');

    if (title) title.textContent = direction === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';

    if (incomeTypes) incomeTypes.classList.toggle('hidden', direction !== 'in');
    if (expenseTypes) expenseTypes.classList.toggle('hidden', direction === 'in');

    if (fuelFields) fuelFields.classList.add('hidden');
    
    document.querySelectorAll('.inc-btn, .exp-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.remove('border-gray-800'); 
    });
}

function updateCategoryUI(category, el) {
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => btn.classList.remove('active'));
    
    if (el) {
        el.classList.add('active');
        el.classList.remove('border-gray-800');
    }

    const fuelFields = document.getElementById('fuel-fields');
    if (fuelFields) {
        if (category === 'fuel') fuelFields.classList.remove('hidden');
        else fuelFields.classList.add('hidden');
    }
}

/* ────────────────────────────────────────────────────────────────
   CONFIRM TRANSACTION
---------------------------------------------------------------- */

export async function confirmTx() {
    vibrate([20]);

    const amountEl = document.getElementById('tx-amount');
    const amount = amountEl ? parseFloat(amountEl.value) : 0;

    if (!amount || amount <= 0) {
        return showToast('Įvesk sumą', 'error');
    }

    state.loading = true;

    try {
        let meta = {};
        if (txDraft.category === 'fuel') {
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            if (gal) meta.gallons = parseFloat(gal);
            if (odo) meta.odometer = parseInt(odo);
        }

        const payload = {
            amount: amount,
            category: txDraft.category,
            meta: meta
        };

        if (txDraft.direction === 'in') {
            await recordTransaction('income', payload);
        } else {
            await recordTransaction('expense', payload);
        }

        if (window.closeModals) window.closeModals();
        
        // Atnaujinam viską
        window.dispatchEvent(new Event('refresh-data'));

    } catch (err) {
        console.error('Finance Error:', err);
        showToast('Klaida: ' + err.message, 'error');
    } finally {
        state.loading = false;
    }
}

async function recordTransaction(type, { amount, category, meta = {} }) {
    if (!state.user?.id) throw new Error('Vartotojas nerastas');

    const shiftId = state.activeShift?.id ?? null;
    const vehicleId = state.activeShift?.vehicle_id ?? null;

    const payload = {
        user_id: state.user.id,
        shift_id: shiftId,
        vehicle_id: vehicleId,
        type: type, 
        category,
        amount,
        ...meta,
        created_at: new Date().toISOString()
    };

    const { error } = await db.from('expenses').insert(payload);
    if (error) throw error;

    if (shiftId) {
        const delta = type === 'income' ? amount : -amount;
        await updateShiftEarnings(delta);
    }

    const sign = type === 'income' ? '+' : '-';
    showToast(`${sign}$${amount.toFixed(2)} įrašyta`, 'success');
}

async function updateShiftEarnings(delta) {
    const { data, error } = await db
        .from('finance_shifts')
        .select('gross_earnings')
        .eq('id', state.activeShift.id)
        .single();

    if (!error && data) {
        const next = (data.gross_earnings || 0) + delta;
        await db.from('finance_shifts').update({ gross_earnings: next }).eq('id', state.activeShift.id);
    }
}

/* ────────────────────────────────────────────────────────────────
   AUDIT & DELETE (UNIFIED HISTORY)
---------------------------------------------------------------- */

export async function refreshAudit() {
    const listEl = document.getElementById('audit-list');
    
    if (!state.user?.id) {
        if (listEl) listEl.innerHTML = '<div class="py-10 text-center opacity-50">Prisijunkite...</div>';
        return;
    }

    try {
        // 1. Gauname pamainas
        const { data: shifts, error: shiftError } = await db
            .from('finance_shifts')
            .select('*')
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false })
            .limit(30);

        if (shiftError) throw shiftError;

        // 2. Gauname pavienes operacijas (kurios neturi shift_id)
        const { data: txs, error: txError } = await db
            .from('expenses')
            .select('*')
            .eq('user_id', state.user.id)
            .is('shift_id', null) // Tik tos, kurios be pamainos
            .order('created_at', { ascending: false })
            .limit(30);

        if (txError) throw txError;

        // 3. Sujungiame ir surikiuojame
        const combined = [
            ...(shifts || []).map(s => ({ ...s, _kind: 'shift', _date: new Date(s.start_time) })),
            ...(txs || []).map(t => ({ ...t, _kind: 'tx', _date: new Date(t.created_at) }))
        ].sort((a, b) => b._date - a._date); // Naujausi viršuje

        renderAuditList(combined);

    } catch (e) { 
        console.error('Audit Load Error:', e);
        if (listEl) listEl.innerHTML = `<div class="py-10 text-center text-red-500">Klaida kraunant duomenis</div>`;
    }
}

function renderAuditList(items) {
    const listEl = document.getElementById('audit-list');
    if (!listEl) return;
    
    const master = document.getElementById('select-all-logs');
    if (master) master.checked = false;
    updateDeleteButtonLocal();

    if (!items || items.length === 0) {
        listEl.innerHTML = `<div class="py-10 text-center opacity-50 text-sm">Nėra istorijos</div>`;
        return;
    }

    listEl.innerHTML = items.map(item => {
        const dateObj = item._date;
        const date = dateObj.toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit' });
        const time = dateObj.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
        
        // Logika pagal tipą (Shift vs Transaction)
        let icon, title, amount, colorClass, valueVal;

        if (item._kind === 'shift') {
            // PAMAINOS KORTELĖ
            icon = 'fa-clock';
            title = 'Shift';
            amount = item.gross_earnings || 0;
            valueVal = `${amount >= 0 ? '+' : ''}$${amount.toFixed(2)}`;
            colorClass = item.status === 'active' ? 'text-teal-500 animate-pulse' : 'text-gray-400';
            if (amount < 0) colorClass = 'text-red-400';
            else if (amount > 0) colorClass = 'text-green-500';
        } else {
            // PAVIENĖS OPERACIJOS KORTELĖ
            title = item.category.toUpperCase();
            amount = item.amount;
            
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

        // Checkbox value turi nurodyti tipą ir ID (pvz: "shift:123" arba "tx:456")
        const checkboxValue = `${item._kind}:${item.id}`;

        return `
        <div class="log-card flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 mb-2">
            <div class="flex gap-4 items-center">
                <input type="checkbox" class="log-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 text-teal-500 focus:ring-0" 
                       value="${checkboxValue}">
                
                <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs opacity-70">
                    <i class="fa-solid ${icon}"></i>
                </div>
                
                <div>
                    <div class="text-xs opacity-50">${date} • ${title}</div>
                    <div class="text-sm font-bold text-white">${time}</div>
                </div>
            </div>
            <div class="font-mono font-bold ${colorClass}">${valueVal}</div>
        </div>`;
    }).join('');

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

/* ────────────────────────────────────────────────────────────────
   WINDOW BINDINGS
---------------------------------------------------------------- */

window.openTxModal = openTxModal;
window.setExpType = setTxCategory;
window.confirmTx = confirmTx;

window.toggleSelectAll = () => {
    const master = document.getElementById('select-all-logs');
    document.querySelectorAll('.log-checkbox').forEach(b => {
        b.checked = master.checked;
    });
    updateDeleteButtonLocal();
};

window.requestDelete = () => {
    vibrate();
    const checked = document.querySelectorAll('.log-checkbox:checked');
    itemsToDelete = Array.from(checked).map(el => {
        const [type, id] = el.value.split(':');
        return { type, id };
    });

    if (itemsToDelete.length === 0) return;
    
    document.getElementById('del-modal-count').textContent = itemsToDelete.length;
    if (window.openModal) window.openModal('delete-modal');
};

window.confirmDelete = async () => {
    vibrate([20]);
    if (itemsToDelete.length === 0) return;
    
    state.loading = true;
    try {
        const shiftIds = itemsToDelete.filter(i => i.type === 'shift').map(i => i.id);
        const txIds = itemsToDelete.filter(i => i.type === 'tx').map(i => i.id);

        // 1. Triname pamainas (ir jų vaikus)
        if (shiftIds.length > 0) {
            await db.from('expenses').delete().in('shift_id', shiftIds); // Saugumo dėlei pirma išlaidas
            await db.from('finance_shifts').delete().in('id', shiftIds);
        }

        // 2. Triname pavienes operacijas
        if (txIds.length > 0) {
            await db.from('expenses').delete().in('id', txIds);
        }

        showToast(`${itemsToDelete.length} įrašai ištrinti`, 'success');
        itemsToDelete = [];
        if (window.closeModals) window.closeModals();
        
        refreshAudit();
        window.dispatchEvent(new Event('refresh-data'));

    } catch (e) {
        showToast('Klaida trinant', 'error');
        console.error(e);
    } finally {
        state.loading = false;
    }
};

window.exportAI = () => {
    showToast('AI Export: Coming Soon', 'info');
};
