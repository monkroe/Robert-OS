// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.1.4
// Logic: O(n) Audit, Transaction Logic & Dynamic UI
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

// ────────────────────────────────────────────────────────────────
// INTERNAL STATE
// ────────────────────────────────────────────────────────────────

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

function escapeHTML(str) {
    if (!str) return "";
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// TRANSACTION LOGIC
// ────────────────────────────────────────────────────────────────

export function openTxModal(dir) {
    vibrate();
    txDraft.direction = dir;
    txDraft.category = dir === 'in' ? 'tips' : 'fuel';
    
    updateTxModalUI(dir);
    
    const inp = document.getElementById('tx-amount');
    if (inp) { 
        inp.value = ''; 
        setTimeout(() => inp.focus(), 100); 
    }
    openModal('tx-modal');
}

export async function confirmTx() {
    vibrate([20]);
    const amount = parseFloat(document.getElementById('tx-amount')?.value || 0);
    
    if (!amount || amount <= 0) {
        showToast('ĮVESKITE SUMĄ', 'warning');
        return;
    }

    state.loading = true;
    try {
        let meta = {};
        if (txDraft.category === 'fuel') {
            meta.gallons = parseFloat(document.getElementById('tx-gal').value) || 0;
            meta.odometer = parseInt(document.getElementById('tx-odo').value) || 0;
        }

        await recordTransaction(txDraft.direction === 'in' ? 'income' : 'expense', {
            amount, 
            category: txDraft.category, 
            meta
        });

        closeModals();
        window.dispatchEvent(new Event('refresh-data')); // Atnaujina UI
        
    } catch (err) {
        showToast('KLAIDA: ' + err.message, 'error');
    } finally {
        state.loading = false;
    }
}

async function recordTransaction(type, { amount, category, meta }) {
    if (!state.user?.id) throw new Error('User offline');

    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: state.activeShift?.id ?? null,
        vehicle_id: state.activeShift?.vehicle_id ?? null,
        type, 
        category, 
        amount, 
        ...meta,
        created_at: new Date().toISOString()
    });

    if (error) throw error;
    showToast(`${type === 'income' ? '+' : '-'}${formatCurrency(amount)}`, 'success');
}

export function setExpType(cat, el) {
    vibrate();
    txDraft.category = cat;
    
    // UI atnaujinimas
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    
    // Kuro laukų rodymas
    const fuelFields = document.getElementById('fuel-fields');
    if (fuelFields) {
        cat === 'fuel' ? fuelFields.classList.remove('hidden') : fuelFields.classList.add('hidden');
    }
}

function updateTxModalUI(dir) {
    const title = document.getElementById('tx-title');
    if (title) title.textContent = dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';
    
    document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
    document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');
    document.getElementById('fuel-fields')?.classList.add('hidden'); // Reset
    
    // Reset active buttons
    document.querySelectorAll('.inc-btn, .exp-btn').forEach(b => b.classList.remove('active'));
}

// ────────────────────────────────────────────────────────────────
// DELETE / MANAGEMENT LOGIC
// ────────────────────────────────────────────────────────────────

export function toggleSelectAll() {
    const master = document.getElementById('select-all-logs');
    document.querySelectorAll('.log-checkbox').forEach(b => b.checked = master.checked);
    updateDeleteButtonLocal();
}

export function requestLogDelete() {
    vibrate();
    const checked = document.querySelectorAll('.log-checkbox:checked');
    
    itemsToDelete = Array.from(checked).map(el => {
        const parts = el.value.split(':');
        return { type: parts[0], id: parts[1] };
    });

    if (itemsToDelete.length === 0) return;

    document.getElementById('del-modal-count').textContent = itemsToDelete.length;
    openModal('delete-modal');
}

export async function confirmLogDelete() {
    vibrate([20]);
    state.loading = true;
    
    try {
        const shiftIds = itemsToDelete.filter(i => i.type === 'shift').map(i => i.id);
        const txIds = itemsToDelete.filter(i => i.type === 'tx').map(i => i.id);

        // 1. Triname pamainas (ir jų išlaidas per Cascade arba rankiniu būdu)
        if (shiftIds.length > 0) {
            await db.from('expenses').delete().in('shift_id', shiftIds);
            await db.from('finance_shifts').delete().in('id', shiftIds);
        }

        // 2. Triname pavienes operacijas
        if (txIds.length > 0) {
            await db.from('expenses').delete().in('id', txIds);
        }

        showToast(`IŠTRINTA: ${itemsToDelete.length}`, 'success');
        itemsToDelete = [];
        closeModals();
        
        // Force refresh
        await refreshAudit();
        window.dispatchEvent(new Event('refresh-data')); // Atnaujina ir balansą
        
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        state.loading = false;
    }
}

export function exportAI() {
    showToast('AI EXPORT: COMING SOON (v2.2)', 'info');
}

// ────────────────────────────────────────────────────────────────
// AUDIT ENGINE (Render Logic)
// ────────────────────────────────────────────────────────────────

export async function refreshAudit() {
    const listEl = document.getElementById('audit-list');
    if (!state.user?.id || !listEl) return;

    try {
        // Fetch Parallel
        const [shiftsRes, expensesRes] = await Promise.all([
            db.from('finance_shifts').select('*, vehicles(name)').eq('user_id', state.user.id).order('start_time', { ascending: false }),
            db.from('expenses').select('*').eq('user_id', state.user.id)
        ]);

        const shifts = shiftsRes.data || [];
        const expenses = expensesRes.data || [];

        if (!shifts.length && !expenses.length) {
            listEl.innerHTML = '<div class="py-10 text-center opacity-50 uppercase text-xs tracking-widest">Istorija tuščia</div>';
            return;
        }

        const groupedData = groupData(shifts, expenses);
        listEl.innerHTML = renderAccordion(groupedData);
        updateDeleteButtonLocal(); // Reset state
        
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div class="py-10 text-center text-red-500 font-bold text-xs">KLAIDA GENERUOJANT ATASKAITĄ</div>';
    }
}

// O(n) Grouping Algorithm
function groupData(shifts, expenses) {
    const years = {};
    const expensesByShift = {};
    const loneExpenses = [];

    // 1. Index Expenses by Shift
    expenses.forEach(e => {
        if (e.shift_id) {
            (expensesByShift[e.shift_id] = expensesByShift[e.shift_id] || []).push(e);
        } else {
            loneExpenses.push(e);
        }
    });

    // 2. Process Shifts
    shifts.forEach(shift => {
        const date = new Date(shift.start_time);
        const y = date.getFullYear();
        const mKey = date.getMonth();

        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[mKey]) years[y].months[mKey] = { net: 0, items: [] };

        const shiftExpenses = expensesByShift[shift.id] || [];
        const shiftNet = shiftExpenses.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);

        years[y].net += shiftNet;
        years[y].months[mKey].net += shiftNet;
        years[y].months[mKey].items.push({ 
            ...shift, 
            _kind: 'shift', 
            _date: date, 
            shiftExpenses, 
            shiftNet 
        });
    });

    // 3. Process Lone Transactions
    loneExpenses.forEach(tx => {
        const date = new Date(tx.created_at);
        const y = date.getFullYear();
        const mKey = date.getMonth();
        
        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[mKey]) years[y].months[mKey] = { net: 0, items: [] };
        
        const amount = tx.type === 'income' ? tx.amount : -tx.amount;
        years[y].net += amount;
        years[y].months[mKey].net += amount;
        years[y].months[mKey].items.push({ 
            ...tx, 
            _kind: 'tx', 
            _date: date 
        });
    });

    return years;
}

// ────────────────────────────────────────────────────────────────
// RENDERERS (HTML Generators)
// ────────────────────────────────────────────────────────────────

function renderAccordion(data) {
    const monthsLT = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'];

    return Object.entries(data).sort((a, b) => b[0] - a[0]).map(([year, yearData]) => `
        <details class="group mb-4" open>
            <summary class="flex justify-between items-center p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer list-none active:scale-[0.99] transition-transform">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
                        <i class="fa-solid fa-chevron-right group-open:rotate-90 transition-transform text-teal-500 text-xs"></i>
                    </div>
                    <span class="text-xl font-black tracking-tighter">${year}</span>
                </div>
                <div class="text-right">
                    <div class="text-[9px] opacity-40 uppercase font-bold tracking-widest">Grynasis Pelnas</div>
                    <div class="font-mono font-bold ${yearData.net >= 0 ? 'text-teal-400' : 'text-red-400'}">${formatCurrency(yearData.net)}</div>
                </div>
            </summary>
            <div class="mt-3 space-y-3 pl-2 animate-slideUp">
                ${Object.entries(yearData.months).sort((a, b) => b[0] - a[0]).map(([mKey, monthData]) => `
                    <details class="group">
                        <summary class="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-xl cursor-pointer list-none ml-2 hover:bg-white/10 transition-colors">
                            <span class="uppercase font-bold text-[10px] tracking-[0.2em] opacity-70 text-teal-500">${monthsLT[mKey]}</span>
                            <span class="font-mono text-xs font-bold">${formatCurrency(monthData.net)}</span>
                        </summary>
                        <div class="py-3 space-y-3 ml-2">
                            ${monthData.items.sort((a, b) => b._date - a._date).map(item => 
                                item._kind === 'shift' ? renderShiftCard(item) : renderTxCard(item)
                            ).join('')}
                        </div>
                    </details>
                `).join('')}
            </div>
        </details>
    `).join('');
}

function renderShiftCard(s) {
    const dist = (s.end_odo || 0) - (s.start_odo || 0);
    const fuelExp = s.shiftExpenses.find(e => e.category === 'fuel');
    const mpg = (fuelExp && fuelExp.gallons > 0 && dist > 0) ? (dist / fuelExp.gallons).toFixed(1) : '-';
    const cpm = dist > 0 ? (s.shiftNet / dist).toFixed(2) : '0.00';
    
    return `
        <div class="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-3 mx-2 border-l-2 ${s.shiftNet >= 0 ? 'border-l-teal-500/50' : 'border-l-red-500/50'}">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <input type="checkbox" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500 focus:ring-0" value="shift:${s.id}" onchange="updateDeleteButtonLocal()">
                    <div>
                        <div class="text-[9px] opacity-40 uppercase font-bold">${s._date.toLocaleDateString('lt-LT')} • ${escapeHTML(s.vehicles?.name)}</div>
                        <div class="text-xs font-bold uppercase tracking-tight">PAMAINOS ATASKAITA</div>
                    </div>
                </div>
                <span class="text-[9px] font-bold px-2 py-1 rounded bg-teal-500/10 text-teal-500 uppercase">${s.weather || '—'}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 border-y border-white/5 py-3">
                <div class="text-center">
                    <div class="label-xs opacity-40">MILES</div>
                    <div class="font-mono font-bold text-sm">${dist > 0 ? dist : '-'}</div>
                </div>
                <div class="text-center border-x border-white/5">
                    <div class="label-xs opacity-40">MPG</div>
                    <div class="font-mono font-bold text-sm text-purple-400">${mpg}</div>
                </div>
                <div class="text-center">
                    <div class="label-xs opacity-40">$/MI</div>
                    <div class="font-mono font-bold text-sm text-blue-400">${cpm}</div>
                </div>
            </div>
            <div class="flex justify-between items-center pt-1">
                <div class="text-lg font-black ${s.shiftNet >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(s.shiftNet)}</div>
                <div class="text-right text-[10px] font-bold opacity-40 uppercase tracking-tighter">GRYNASIS</div>
            </div>
        </div>
    `;
}

function renderTxCard(tx) {
    const isInc = tx.type === 'income';
    return `
        <div class="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl mx-2">
            <div class="flex items-center gap-3">
                <input type="checkbox" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500 focus:ring-0" value="tx:${tx.id}" onchange="updateDeleteButtonLocal()">
                <div class="w-8 h-8 rounded-lg ${isInc ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'} flex items-center justify-center text-xs">
                    <i class="fa-solid ${isInc ? 'fa-arrow-down-long' : 'fa-gas-pump'}"></i>
                </div>
                <div>
                    <div class="text-[9px] opacity-40 uppercase font-bold">${tx._date.toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'})}</div>
                    <div class="text-xs font-bold uppercase tracking-tight">${tx.category}</div>
                </div>
            </div>
            <div class="font-mono font-bold ${isInc ? 'text-green-500' : 'text-red-400'}">${isInc ? '+' : '-'}${formatCurrency(tx.amount)}</div>
        </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// DYNAMIC UI HELPERS (Must be Global)
// ────────────────────────────────────────────────────────────────

// Ši funkcija privalo būti pasiekiama per window, nes HTML generuojamas dinamiškai
window.updateDeleteButtonLocal = () => {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    if (btn) btn.classList.toggle('hidden', checked.length === 0);
    
    const count = document.getElementById('delete-count');
    if (count) count.textContent = checked.length;
};

// Eksportuojame (dėl suderinamumo), bet ir paliekame window binding aukščiau
export function updateDeleteButtonLocal() {
    window.updateDeleteButtonLocal();
}
