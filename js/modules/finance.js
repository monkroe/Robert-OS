// ════════════════════════════════════════════════════════════════
// ROBERT OS — FINANCE MODULE v1.7.5 (FIXED)
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
let idsToDelete = [];

/* ────────────────────────────────────────────────────────────────
   UI → CORE BRIDGE
---------------------------------------------------------------- */

export function openTxModal(direction) {
    vibrate();
    txDraft.direction = direction;
    
    // Nustatome numatytąją kategoriją
    txDraft.category = direction === 'in' ? 'tips' : 'fuel';

    // Atnaujiname UI
    updateTxModalUI(direction);
    
    // Išvalome įvestis
    const amountInput = document.getElementById('tx-amount');
    if (amountInput) amountInput.value = '';
    
    window.openModal('tx-modal');
}

export function setTxCategory(category, el) {
    vibrate();
    txDraft.category = category;
    updateCategoryUI(category, el);
}

/* ────────────────────────────────────────────────────────────────
   UI UPDATERS (Missing in previous version)
---------------------------------------------------------------- */

function updateTxModalUI(direction) {
    const title = document.getElementById('tx-title');
    const incomeTypes = document.getElementById('income-types');
    const expenseTypes = document.getElementById('expense-types');
    const fuelFields = document.getElementById('fuel-fields');

    // Tekstai
    if (title) title.textContent = direction === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';

    // Mygtukų rodymas
    if (incomeTypes) incomeTypes.classList.toggle('hidden', direction !== 'in');
    if (expenseTypes) expenseTypes.classList.toggle('hidden', direction === 'in');

    // Resetuojame kuro laukus atidarant
    if (fuelFields) fuelFields.classList.add('hidden');
    
    // Pažymime default mygtuką
    const defaultCat = direction === 'in' ? 'tips' : 'fuel';
    const btnSelector = direction === 'in' ? '#income-types .inc-btn' : '#expense-types .exp-btn';
    
    // Vizualus "active" klasės nuėmimas
    document.querySelectorAll('.inc-btn, .exp-btn').forEach(b => b.classList.remove('active'));
    
    // Čia reikėtų surasti konkretų mygtuką pagal kategoriją, 
    // bet paprasčiau tai palikti setTxCategory logikai arba vartotojui paspaudus.
}

function updateCategoryUI(category, el) {
    // UI stilius
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');

    // Kuro laukų logika
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

    // 1. Nuskaitome sumą tiesiai iš DOM (saugiau nei pasikliauti draft eventais)
    const amountEl = document.getElementById('tx-amount');
    const amount = amountEl ? parseFloat(amountEl.value) : 0;

    if (!amount || amount <= 0) {
        return showToast('Įvesk sumą', 'error');
    }

    if (!txDraft.category) {
        return showToast('Pasirink kategoriją', 'error');
    }

    state.loading = true;

    try {
        // 2. Surenkame papildomus duomenis (meta), jei tai kuras
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
            await recordIncome(payload);
        } else {
            await recordExpense(payload);
        }

        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));

    } catch (err) {
        console.error('Finance Error:', err);
        showToast(err.message || 'Klaida', 'error');
    } finally {
        state.loading = false;
    }
}

/* ────────────────────────────────────────────────────────────────
   CORE FINANCE OPERATIONS
---------------------------------------------------------------- */

async function recordIncome({ amount, category }) {
    const payload = {
        user_id: state.user.id,
        shift_id: state.activeShift?.id ?? null,
        vehicle_id: state.activeShift?.vehicle_id ?? null,
        type: 'income',
        category,
        amount,
        created_at: new Date().toISOString()
    };

    const { error } = await db.from('expenses').insert(payload);
    if (error) throw error;

    // Jei yra pamaina, atnaujiname jos bendrą uždarbį
    if (state.activeShift?.id) {
        await updateShiftEarnings(amount);
    }

    showToast(`+$${amount.toFixed(2)}`, 'success');
}

async function recordExpense({ amount, category, meta }) {
    if (!state.activeShift) {
        throw new Error('Išlaidoms reikia aktyvios pamainos');
    }

    const payload = {
        user_id: state.user.id,
        shift_id: state.activeShift.id,
        vehicle_id: state.activeShift.vehicle_id,
        type: 'expense',
        category,
        amount,
        ...meta, // Išskleidžiame galonus ir odometrą čia
        created_at: new Date().toISOString()
    };

    const { error } = await db.from('expenses').insert(payload);
    if (error) throw error;

    showToast(`-$${amount.toFixed(2)}`, 'info');
}

async function updateShiftEarnings(delta) {
    // Supabase RPC būtų saugiau, bet kol kas naudojame GET->UPDATE
    const { data, error } = await db
        .from('finance_shifts')
        .select('gross_earnings')
        .eq('id', state.activeShift.id)
        .single();

    if (error) throw error;

    const next = (data.gross_earnings || 0) + delta;

    const { error: updateError } = await db
        .from('finance_shifts')
        .update({ gross_earnings: next })
        .eq('id', state.activeShift.id);

    if (updateError) throw updateError;
}

/* ────────────────────────────────────────────────────────────────
   AUDIT & DELETE (Jūsų kodas čia buvo geras, paliekame)
---------------------------------------------------------------- */
export async function refreshAudit() {
    try {
        const { data, error } = await db
            .from('finance_shifts')
            .select('*')
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false })
            .limit(50);

        if (error) throw error;
        renderAuditList(data);
    } catch (e) { console.error(e); }
}

function renderAuditList(shifts) {
    const listEl = document.getElementById('audit-list');
    if (!listEl) return;
    
    // Reset checkbox master
    const master = document.getElementById('select-all-logs');
    if (master) master.checked = false;
    if (window.updateDeleteButton) window.updateDeleteButton();

    if (!shifts || shifts.length === 0) {
        listEl.innerHTML = `<div class="py-10 text-center opacity-50 text-sm">Nėra istorijos</div>`;
        return;
    }

    listEl.innerHTML = shifts.map(shift => {
        const start = new Date(shift.start_time);
        const date = start.toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit' });
        const time = start.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
        const earn = shift.gross_earnings || 0;
        const statusClass = shift.status === 'completed' ? 'text-gray-400' : 'text-teal-500 animate-pulse';

        return `
        <div class="log-card flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 mb-2">
            <div class="flex gap-4 items-center">
                <input type="checkbox" class="log-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 text-teal-500 focus:ring-0" value="${shift.id}" onchange="updateDeleteButton()">
                <div>
                    <div class="text-xs opacity-50">${date}</div>
                    <div class="text-sm font-bold ${statusClass}">${time}</div>
                </div>
            </div>
            <div class="font-mono font-bold text-green-500">+$${earn.toFixed(2)}</div>
        </div>`;
    }).join('');
}

// Globalios funkcijos ištrynimui
window.toggleSelectAll = () => {
    const master = document.getElementById('select-all-logs');
    document.querySelectorAll('.log-checkbox').forEach(b => b.checked = master.checked);
    window.updateDeleteButton();
};

window.updateDeleteButton = () => {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    const count = document.getElementById('delete-count');
    
    if (btn && count) {
        count.textContent = checked.length;
        if (checked.length > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
};

export function requestDelete() {
    vibrate();
    idsToDelete = Array.from(document.querySelectorAll('.log-checkbox:checked')).map(el => el.value);
    if (idsToDelete.length === 0) return;
    document.getElementById('del-modal-count').textContent = idsToDelete.length;
    window.openModal('delete-modal');
}

export async function confirmDelete() {
    vibrate([20]);
    if (idsToDelete.length === 0) return;
    state.loading = true;
    try {
        await db.from('expenses').delete().in('shift_id', idsToDelete);
        await db.from('finance_shifts').delete().in('id', idsToDelete);
        showToast(`${idsToDelete.length} įrašai ištrinti`, 'success');
        idsToDelete = [];
        window.closeModals();
        refreshAudit();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) {
        showToast('Klaida trinant', 'error');
    } finally {
        state.loading = false;
    }
}
