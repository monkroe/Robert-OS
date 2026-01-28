// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v2.1.3
// Logic: O(n) Grouping, Transaction-based Net Profit, Stable Keys
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

function escapeHTML(str) {
    if (!str) return "";
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

/* ────────────────────────────────────────────────────────────────
   TRANSACTION & DELETION
---------------------------------------------------------------- */

window.openTxModal = (dir) => {
    vibrate();
    txDraft.direction = dir;
    txDraft.category = dir === 'in' ? 'tips' : 'fuel';
    updateTxModalUI(dir);
    const inp = document.getElementById('tx-amount');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
    window.openModal('tx-modal');
};

window.confirmTx = async () => {
    vibrate([20]);
    const amount = parseFloat(document.getElementById('tx-amount')?.value || 0);
    if (!amount || amount <= 0) return showToast('Įvesk sumą', 'error');

    state.loading = true;
    try {
        let meta = {};
        if (txDraft.category === 'fuel') {
            meta.gallons = parseFloat(document.getElementById('tx-gal').value) || 0;
            meta.odometer = parseInt(document.getElementById('tx-odo').value) || 0;
        }
        await recordTransaction(txDraft.direction === 'in' ? 'income' : 'expense', {
            amount, category: txDraft.category, meta
        });
        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (err) {
        showToast('Klaida: ' + err.message, 'error');
    } finally {
        state.loading = false;
    }
};

async function recordTransaction(type, { amount, category, meta }) {
    if (!state.user?.id) throw new Error('User not found');
    const shiftId = state.activeShift?.id ?? null;

    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: shiftId,
        vehicle_id: state.activeShift?.vehicle_id ?? null,
        type, category, amount, ...meta,
        created_at: new Date().toISOString()
    });
    if (error) throw error;
    showToast(`${type === 'income' ? '+' : '-'}${formatCurrency(amount)} įrašyta`, 'success');
}

/* ────────────────────────────────────────────────────────────────
   AUDIT ENGINE (O(n) Performance)
---------------------------------------------------------------- */

export async function refreshAudit() {
    const listEl = document.getElementById('audit-list');
    if (!state.user?.id || !listEl) return;

    try {
        const { data: shifts } = await db.from('finance_shifts')
            .select('*, vehicles(name)')
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false });

        const { data: expenses } = await db.from('expenses')
            .select('*')
            .eq('user_id', state.user.id);

        if (!shifts || shifts.length === 0) {
            listEl.innerHTML = '<div class="py-10 text-center opacity-50 uppercase text-xs">Istorija tuščia</div>';
            return;
        }

        const groupedData = groupData(shifts, expenses || []);
        listEl.innerHTML = renderAccordion(groupedData);
        updateDeleteButtonLocal();
    } catch (e) {
        console.error('Audit Error:', e);
        listEl.innerHTML = '<div class="py-10 text-center text-red-500">Klaida generuojant ataskaitą</div>';
    }
}

function groupData(shifts, expenses) {
    const years = {};
    const expensesByShift = {};
    const loneExpenses = [];

    // O(n) Optimization: Map expenses to shifts
    expenses.forEach(e => {
        if (e.shift_id) {
            (expensesByShift[e.shift_id] = expensesByShift[e.shift_id] || []).push(e);
        } else {
            loneExpenses.push(e);
        }
    });

    shifts.forEach(shift => {
        const date = new Date(shift.start_time);
        const y = date.getFullYear();
        const mKey = date.getMonth();

        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[mKey]) years[y].months[mKey] = { net: 0, items: [] };

        const shiftExpenses = expensesByShift[shift.id] || [];
        
        // Audit = Source of Truth: Net calculated strictly from shift transactions
        const shiftNet = shiftExpenses.reduce((sum, e) => {
            return sum + (e.type === 'income' ? e.amount : -e.amount);
        }, 0);

        years[y].net += shiftNet;
        years[y].months[mKey].net += shiftNet;
        years[y].months[mKey].items.push({ ...shift, _kind: 'shift', _date: date, shiftExpenses, shiftNet });
    });

    loneExpenses.forEach(tx => {
        const date = new Date(tx.created_at);
        const y = date.getFullYear();
        const mKey = date.getMonth();
        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[mKey]) years[y].months[mKey] = { net: 0, items: [] };
        const amount = tx.type === 'income' ? tx.amount : -tx.amount;
        years[y].net += amount;
        years[y].months[mKey].net += amount;
        years[y].months[mKey].items.push({ ...tx, _kind: 'tx', _date: date });
    });

    return years;
}

/* ────────────────────────────────────────────────────────────────
   RENDERING
---------------------------------------------------------------- */

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
                    <div class="text-[9px] opacity-40 uppercase font-bold tracking-widest">Yearly Net</div>
                    <div class="font-mono font-bold ${yearData.net >= 0 ? 'text-teal-400' : 'text-red-400'}">${formatCurrency(yearData.net)}</div>
                </div>
            </summary>
            <div class="mt-3 space-y-3 pl-2">
                ${Object.entries(yearData.months).sort((a, b) => b[0] - a[0]).map(([mKey, monthData]) => `
                    <details class="group">
                        <summary class="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-xl cursor-pointer list-none ml-2 hover:bg-white/10 transition-colors">
                            <span class="uppercase font-bold text-[10px] tracking-[0.2em] opacity-70">${monthsLT[mKey]}</span>
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
    const mpg = (fuelExp && fuelExp.gallons > 0) ? (dist / fuelExp.gallons).toFixed(1) : 'N/A';
    const cpm = dist > 0 ? (s.shiftNet / dist).toFixed(2) : '0.00';
    
    return `
        <div class="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-3 mx-2 border-l-2 ${s.shiftNet >= 0 ? 'border-l-teal-500/50' : 'border-l-red-500/50'}">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <input type="checkbox" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500" value="shift:${s.id}" onchange="updateDeleteButtonLocal()">
                    <div>
                        <div class="text-[9px] opacity-40 uppercase font-bold">${s._date.toLocaleDateString('lt-LT')} • ${escapeHTML(s.vehicles?.name)}</div>
                        <div class="text-xs font-bold uppercase tracking-tight">Shift Report</div>
                    </div>
                </div>
                <span class="text-[9px] font-bold px-2 py-1 rounded bg-teal-500/10 text-teal-500 uppercase">${s.weather || 'Clear'}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 border-y border-white/5 py-3">
                <div class="text-center">
                    <div class="label-xs opacity-40">Miles</div>
                    <div class="font-mono font-bold text-sm">${dist}</div>
                </div>
                <div class="text-center border-x border-white/5">
                    <div class="label-xs opacity-40">MPG</div>
                    <div class="font-mono font-bold text-sm text-purple-400">${mpg}</div>
                </div>
                <div class="text-center">
                    <div class="label-xs opacity-40">$/Mi</div>
                    <div class="font-mono font-bold text-sm text-blue-400">${cpm}</div>
                </div>
            </div>
            <div class="flex justify-between items-center pt-1">
                <div class="text-lg font-black ${s.shiftNet >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(s.shiftNet)}</div>
                <div class="text-right text-[10px] font-bold opacity-40 uppercase tracking-tighter">Net Earned</div>
            </div>
        </div>
    `;
}

function renderTxCard(tx) {
    const isInc = tx.type === 'income';
    return `
        <div class="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl mx-2">
            <div class="flex items-center gap-3">
                <input type="checkbox" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500" value="tx:${tx.id}" onchange="updateDeleteButtonLocal()">
                <div class="w-8 h-8 rounded-lg ${isInc ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'} flex items-center justify-center text-xs">
                    <i class="fa-solid ${isInc ? 'fa-arrow-down-long' : 'fa-gas-pump'}"></i>
                </div>
                <div>
                    <div class="text-[9px] opacity-40 uppercase font-bold">${tx._date.toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'})}</div>
                    <div class="text-xs font-bold uppercase">${tx.category}</div>
                </div>
            </div>
            <div class="font-mono font-bold ${isInc ? 'text-green-500' : 'text-red-400'}">${isInc ? '+' : '-'}${formatCurrency(tx.amount)}</div>
        </div>
    `;
}

export function updateDeleteButtonLocal() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    if (btn) btn.classList.toggle('hidden', checked.length === 0);
    const count = document.getElementById('delete-count');
    if (count) count.textContent = checked.length;
}

window.updateDeleteButtonLocal = updateDeleteButtonLocal;
window.setExpType = (cat, el) => {
    vibrate();
    txDraft.category = cat;
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('fuel-fields')?.classList.toggle('hidden', cat !== 'fuel');
};

_________________________________
Nauja versija

// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v2.1.4
// Logic: O(n) Grouping, Transaction-based Net Profit, Stable Keys
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

function escapeHTML(str) {
    if (!str) return "";
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

/* ────────────────────────────────────────────────────────────────
   TRANSACTION & DELETION LOGIC
---------------------------------------------------------------- */

window.openTxModal = (dir) => {
    vibrate();
    txDraft.direction = dir;
    txDraft.category = dir === 'in' ? 'tips' : 'fuel';
    updateTxModalUI(dir);
    const inp = document.getElementById('tx-amount');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
    window.openModal('tx-modal');
};

window.confirmTx = async () => {
    vibrate([20]);
    const amount = parseFloat(document.getElementById('tx-amount')?.value || 0);
    if (!amount || amount <= 0) return showToast('Įvesk sumą', 'error');

    state.loading = true;
    try {
        let meta = {};
        if (txDraft.category === 'fuel') {
            meta.gallons = parseFloat(document.getElementById('tx-gal').value) || 0;
            meta.odometer = parseInt(document.getElementById('tx-odo').value) || 0;
        }
        await recordTransaction(txDraft.direction === 'in' ? 'income' : 'expense', {
            amount, category: txDraft.category, meta
        });
        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (err) {
        showToast('Klaida: ' + err.message, 'error');
    } finally {
        state.loading = false;
    }
};

async function recordTransaction(type, { amount, category, meta }) {
    if (!state.user?.id) throw new Error('User not found');
    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: state.activeShift?.id ?? null,
        vehicle_id: state.activeShift?.vehicle_id ?? null,
        type, category, amount, ...meta,
        created_at: new Date().toISOString()
    });
    if (error) throw error;
    showToast(`${type === 'income' ? '+' : '-'}${formatCurrency(amount)}`, 'success');
}

window.toggleSelectAll = () => {
    const master = document.getElementById('select-all-logs');
    document.querySelectorAll('.log-checkbox').forEach(b => b.checked = master.checked);
    updateDeleteButtonLocal();
};

window.requestLogDelete = () => {
    vibrate();
    const checked = document.querySelectorAll('.log-checkbox:checked');
    itemsToDelete = Array.from(checked).map(el => {
        const parts = el.value.split(':');
        return { type: parts[0], id: parts[1] };
    });
    if (itemsToDelete.length === 0) return;
    document.getElementById('del-modal-count').textContent = itemsToDelete.length;
    window.openModal('delete-modal');
};

window.confirmLogDelete = async () => {
    vibrate([20]);
    state.loading = true;
    try {
        const shiftIds = itemsToDelete.filter(i => i.type === 'shift').map(i => i.id);
        const txIds = itemsToDelete.filter(i => i.type === 'tx').map(i => i.id);
        if (shiftIds.length > 0) {
            await db.from('expenses').delete().in('shift_id', shiftIds);
            await db.from('finance_shifts').delete().in('id', shiftIds);
        }
        if (txIds.length > 0) await db.from('expenses').delete().in('id', txIds);
        showToast(`Ištrinta įrašų: ${itemsToDelete.length}`, 'success');
        itemsToDelete = [];
        window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
};

/* ────────────────────────────────────────────────────────────────
   AUDIT ENGINE (Optimized O(n))
---------------------------------------------------------------- */

export async function refreshAudit() {
    const listEl = document.getElementById('audit-list');
    if (!state.user?.id || !listEl) return;

    try {
        const { data: shifts } = await db.from('finance_shifts').select('*, vehicles(name)').eq('user_id', state.user.id).order('start_time', { ascending: false });
        const { data: expenses } = await db.from('expenses').select('*').eq('user_id', state.user.id);

        if (!shifts || shifts.length === 0) {
            listEl.innerHTML = '<div class="py-10 text-center opacity-50 uppercase text-xs">Istorija tuščia</div>';
            return;
        }

        const groupedData = groupData(shifts, expenses || []);
        listEl.innerHTML = renderAccordion(groupedData);
        updateDeleteButtonLocal();
    } catch (e) { listEl.innerHTML = '<div class="py-10 text-center text-red-500">Klaida generuojant auditą</div>'; }
}

function groupData(shifts, expenses) {
    const years = {};
    const expensesByShift = {};
    const loneExpenses = [];

    expenses.forEach(e => {
        if (e.shift_id) { (expensesByShift[e.shift_id] = expensesByShift[e.shift_id] || []).push(e); }
        else { loneExpenses.push(e); }
    });

    shifts.forEach(shift => {
        const date = new Date(shift.start_time);
        const y = date.getFullYear(), mKey = date.getMonth();
        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[mKey]) years[y].months[mKey] = { net: 0, items: [] };

        const shiftExpenses = expensesByShift[shift.id] || [];
        const shiftNet = shiftExpenses.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);

        years[y].net += shiftNet;
        years[y].months[mKey].net += shiftNet;
        years[y].months[mKey].items.push({ ...shift, _kind: 'shift', _date: date, shiftExpenses, shiftNet });
    });

    loneExpenses.forEach(tx => {
        const date = new Date(tx.created_at);
        const y = date.getFullYear(), mKey = date.getMonth();
        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[mKey]) years[y].months[mKey] = { net: 0, items: [] };
        const amount = tx.type === 'income' ? tx.amount : -tx.amount;
        years[y].net += amount;
        years[y].months[mKey].net += amount;
        years[y].months[mKey].items.push({ ...tx, _kind: 'tx', _date: date });
    });

    return years;
}

/* ────────────────────────────────────────────────────────────────
   RENDERING
---------------------------------------------------------------- */

function renderAccordion(data) {
    const monthsLT = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'];

    return Object.entries(data).sort((a, b) => b[0] - a[0]).map(([year, yearData]) => `
        <details class="group mb-4" open>
            <summary class="flex justify-between items-center p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer list-none">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-chevron-right group-open:rotate-90 transition-transform text-teal-500 text-xs"></i>
                    <span class="text-xl font-black tracking-tighter">${year}</span>
                </div>
                <div class="text-right font-mono font-bold ${yearData.net >= 0 ? 'text-teal-400' : 'text-red-400'}">${formatCurrency(yearData.net)}</div>
            </summary>
            <div class="mt-3 space-y-3 pl-2">
                ${Object.entries(yearData.months).sort((a, b) => b[0] - a[0]).map(([mKey, monthData]) => `
                    <details class="group">
                        <summary class="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-xl cursor-pointer list-none ml-2">
                            <span class="uppercase font-bold text-[10px] tracking-widest opacity-70">${monthsLT[mKey]}</span>
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
    const totalGallons = s.shiftExpenses.filter(e => e.category === 'fuel').reduce((sum, e) => sum + (parseFloat(e.gallons) || 0), 0);
    const mpg = (totalGallons > 0) ? (dist / totalGallons).toFixed(1) : 'N/A';
    const cpm = dist > 0 ? (s.shiftNet / dist).toFixed(2) : '0.00';
    
    return `
        <div class="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-3 mx-2 border-l-2 ${s.shiftNet >= 0 ? 'border-l-teal-500' : 'border-l-red-500'}">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <input type="checkbox" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500" value="shift:${s.id}" onchange="updateDeleteButtonLocal()">
                    <div>
                        <div class="text-[9px] opacity-40 uppercase font-bold">${s._date.toLocaleDateString('lt-LT')} • ${escapeHTML(s.vehicles?.name)}</div>
                        <div class="text-xs font-bold uppercase">Shift Report</div>
                    </div>
                </div>
                <span class="text-[9px] font-bold px-2 py-1 rounded bg-teal-500/10 text-teal-500 uppercase">${s.weather || 'Clear'}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 border-y border-white/5 py-3">
                <div class="text-center"><div class="label-xs opacity-40 uppercase">Miles</div><div class="font-mono font-bold text-sm">${dist}</div></div>
                <div class="text-center border-x border-white/5"><div class="label-xs opacity-40 uppercase">MPG</div><div class="font-mono font-bold text-sm text-purple-400">${mpg}</div></div>
                <div class="text-center"><div class="label-xs opacity-40 uppercase">$/Mi</div><div class="font-mono font-bold text-sm text-blue-400">${cpm}</div></div>
            </div>
            <div class="flex justify-between items-center pt-1">
                <div class="text-lg font-black ${s.shiftNet >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(s.shiftNet)}</div>
                <div class="text-right text-[10px] font-bold opacity-40 uppercase">Net Profit</div>
            </div>
        </div>
    `;
}

function renderTxCard(tx) {
    const isInc = tx.type === 'income';
    return `
        <div class="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl mx-2">
            <div class="flex items-center gap-3">
                <input type="checkbox" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500" value="tx:${tx.id}" onchange="updateDeleteButtonLocal()">
                <div class="w-8 h-8 rounded-lg ${isInc ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'} flex items-center justify-center text-xs">
                    <i class="fa-solid ${isInc ? 'fa-arrow-down-long' : 'fa-gas-pump'}"></i>
                </div>
                <div>
                    <div class="text-[9px] opacity-40 uppercase font-bold">${tx._date.toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'})}</div>
                    <div class="text-xs font-bold uppercase">${tx.category}</div>
                </div>
            </div>
            <div class="font-mono font-bold ${isInc ? 'text-green-500' : 'text-red-400'}">${isInc ? '+' : '-'}${formatCurrency(tx.amount)}</div>
        </div>
    `;
}

/* ────────────────────────────────────────────────────────────────
   HELPERS & BINDINGS
---------------------------------------------------------------- */

function updateTxModalUI(dir) {
    const title = document.getElementById('tx-title');
    if (title) title.textContent = dir === 'in' ? 'ADD INCOME' : 'ADD EXPENSE';
    document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
    document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');
    document.getElementById('fuel-fields')?.classList.add('hidden');
    document.querySelectorAll('.inc-btn, .exp-btn').forEach(b => b.classList.remove('active'));
}

window.setExpType = (cat, el) => {
    vibrate();
    txDraft.category = cat;
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('fuel-fields')?.classList.toggle('hidden', cat !== 'fuel');
};

export function updateDeleteButtonLocal() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    if (btn) btn.classList.toggle('hidden', checked.length === 0);
    const count = document.getElementById('delete-count');
    if (count) count.textContent = checked.length;
}

window.updateDeleteButtonLocal = updateDeleteButtonLocal;
window.exportAI = () => showToast('AI Export ruošiamas v2.2', 'info');

