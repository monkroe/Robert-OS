// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.2.0
// Logic: Advanced Analytics (MPG, CPM, RPM) & Detail View
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

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
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
    openModal('tx-modal');
}

export async function confirmTx() {
    vibrate([20]);
    const amount = parseFloat(document.getElementById('tx-amount')?.value || 0);
    
    if (!amount || amount <= 0) return showToast('ĮVESKITE SUMĄ', 'warning');

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

        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (err) {
        showToast(err.message, 'error');
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
        type, category, amount, ...meta,
        created_at: new Date().toISOString()
    });
    if (error) throw error;
    showToast('Išsaugota', 'success');
}

export function setExpType(cat, el) {
    vibrate();
    txDraft.category = cat;
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    
    const f = document.getElementById('fuel-fields');
    if(f) cat === 'fuel' ? f.classList.remove('hidden') : f.classList.add('hidden');
}

function updateTxModalUI(dir) {
    const t = document.getElementById('tx-title');
    if(t) t.textContent = dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';
    document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
    document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');
    document.getElementById('fuel-fields')?.classList.add('hidden');
    document.querySelectorAll('.inc-btn, .exp-btn').forEach(b => b.classList.remove('active'));
}

// ────────────────────────────────────────────────────────────────
// MANAGEMENT
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
    state.loading = true;
    try {
        const shiftIds = itemsToDelete.filter(i => i.type === 'shift').map(i => i.id);
        const txIds = itemsToDelete.filter(i => i.type === 'tx').map(i => i.id);
        if (shiftIds.length > 0) {
            await db.from('expenses').delete().in('shift_id', shiftIds);
            await db.from('finance_shifts').delete().in('id', shiftIds);
        }
        if (txIds.length > 0) await db.from('expenses').delete().in('id', txIds);
        showToast('Ištrinta', 'success');
        itemsToDelete = [];
        closeModals();
        await refreshAudit();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export function exportAI() { showToast('AI funkcija ruošiama (v2.3)', 'info'); }

// ────────────────────────────────────────────────────────────────
// AUDIT ENGINE (ANALYTICS)
// ────────────────────────────────────────────────────────────────

export async function refreshAudit() {
    const listEl = document.getElementById('audit-list');
    if (!state.user?.id || !listEl) return;

    try {
        const [shiftsRes, expensesRes] = await Promise.all([
            db.from('finance_shifts').select('*, vehicles(name)').eq('user_id', state.user.id).order('start_time', { ascending: false }),
            db.from('expenses').select('*').eq('user_id', state.user.id)
        ]);

        const shifts = shiftsRes.data || [];
        const expenses = expensesRes.data || [];

        if (shifts.length === 0 && expenses.length === 0) {
            listEl.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 opacity-30">
                    <i class="fa-solid fa-folder-open text-4xl mb-4"></i>
                    <span class="text-xs font-bold uppercase tracking-widest">Istorija tuščia</span>
                </div>`;
            return;
        }

        const groupedData = groupData(shifts, expenses);
        listEl.innerHTML = renderAccordion(groupedData);
        updateDeleteButtonLocal();
        
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div class="py-10 text-center text-red-500 text-xs">KLAIDA GENERUOJANT ATASKAITĄ</div>';
    }
}

function groupData(shifts, expenses) {
    const years = {};
    const expensesByShift = {};
    const loneExpenses = [];

    expenses.forEach(e => {
        if (e.shift_id) {
            const sid = String(e.shift_id);
            (expensesByShift[sid] = expensesByShift[sid] || []).push(e);
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

        const shiftExpenses = expensesByShift[String(shift.id)] || [];
        const shiftNet = shiftExpenses.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);

        years[y].net += shiftNet;
        years[y].months[mKey].net += shiftNet;
        years[y].months[mKey].items.push({ 
            ...shift, _kind: 'shift', _date: date, shiftExpenses, shiftNet 
        });
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

// ────────────────────────────────────────────────────────────────
// RENDERERS (DETAILED ACCORDION)
// ────────────────────────────────────────────────────────────────

function renderAccordion(data) {
    const monthsLT = ['SAUSIS', 'VASARIS', 'KOVAS', 'BALANDIS', 'GEGUŽĖ', 'BIRŽELIS', 'LIEPA', 'RUGPJŪTIS', 'RUGSĖJIS', 'SPALIS', 'LAPKRITIS', 'GRUODIS'];
    
    return Object.entries(data).sort((a, b) => b[0] - a[0]).map(([year, yearData]) => `
        <details class="group mb-4" open>
            <summary class="flex justify-between items-center p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer list-none">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-chevron-right group-open:rotate-90 transition-transform text-teal-500 text-xs"></i>
                    <span class="text-xl font-black tracking-tighter">${year}</span>
                </div>
                <div class="font-mono font-bold ${yearData.net >= 0 ? 'text-teal-400' : 'text-red-400'}">${formatCurrency(yearData.net)}</div>
            </summary>
            <div class="mt-3 space-y-3 pl-2 animate-slideUp">
                ${Object.entries(yearData.months).sort((a, b) => b[0] - a[0]).map(([mKey, monthData]) => `
                    <div class="mb-4">
                        <div class="flex justify-between items-center px-4 py-2 border-b border-white/5 mb-2">
                            <span class="text-[10px] font-bold text-teal-500 tracking-widest">${monthsLT[mKey]}</span>
                            <span class="text-[10px] font-mono opacity-50">${formatCurrency(monthData.net)}</span>
                        </div>
                        <div class="space-y-3">
                            ${monthData.items.sort((a, b) => b._date - a._date).map(item => 
                                item._kind === 'shift' ? renderDetailedShiftCard(item) : renderTxCard(item)
                            ).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </details>
    `).join('');
}

function renderDetailedShiftCard(s) {
    // 1. CALCULATIONS
    const dist = (s.end_odo || 0) - (s.start_odo || 0);
    const durationMs = new Date(s.end_time || new Date()) - new Date(s.start_time);
    const hours = Math.max(0.1, durationMs / (1000 * 60 * 60)); // Avoid div by 0
    
    // Group Expenses
    const income = s.shiftExpenses.filter(e => e.type === 'income');
    const expense = s.shiftExpenses.filter(e => e.type === 'expense');
    
    const gross = income.reduce((acc, i) => acc + i.amount, 0);
    const totalExp = expense.reduce((acc, e) => acc + e.amount, 0);
    
    // Fuel Stats
    const fuelTxs = expense.filter(e => e.category === 'fuel');
    const totalGal = fuelTxs.reduce((acc, f) => acc + (parseFloat(f.gallons) || 0), 0);
    const mpg = (totalGal > 0 && dist > 0) ? (dist / totalGal).toFixed(1) : 'N/A';
    
    // Economics
    const cpm = dist > 0 ? (totalExp / dist).toFixed(2) : '0.00';
    const rpm = dist > 0 ? (gross / dist).toFixed(2) : '0.00';
    const hourly = (s.shiftNet / hours).toFixed(2);
    
    // Formatting Times
    const tStart = new Date(s.start_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'});
    const tEnd = s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'}) : 'Active';

    // 2. HTML GENERATION (Accordion Style)
    return `
    <div class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mx-1">
        <div class="p-4 bg-white/5 flex justify-between items-start">
            <div class="flex gap-3">
                 <input type="checkbox" class="log-checkbox w-5 h-5 mt-1 rounded border-gray-700 bg-black text-teal-500 focus:ring-0" value="shift:${s.id}" onchange="updateDeleteButtonLocal()">
                 <div>
                    <div class="text-[10px] opacity-50 font-bold uppercase tracking-wider mb-1">${s._date.toLocaleDateString('lt-LT')} • ${escapeHTML(s.vehicles?.name)}</div>
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-black tracking-tight text-white">${tStart} - ${tEnd}</span>
                        <span class="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-teal-400 font-bold">${Math.round(hours)}h</span>
                    </div>
                 </div>
            </div>
            <div class="text-right">
                <div class="text-lg font-black ${s.shiftNet >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(s.shiftNet)}</div>
                <div class="text-[9px] opacity-40 font-bold uppercase">NET PROFIT</div>
            </div>
        </div>

        <div class="grid grid-cols-3 border-y border-white/5 bg-black/20">
            <div class="p-2 text-center border-r border-white/5">
                <div class="text-[9px] opacity-40 uppercase font-bold">Dist</div>
                <div class="text-xs font-mono font-bold">${dist} mi</div>
            </div>
            <div class="p-2 text-center border-r border-white/5">
                <div class="text-[9px] opacity-40 uppercase font-bold">MPG</div>
                <div class="text-xs font-mono font-bold text-yellow-500">${mpg}</div>
            </div>
            <div class="p-2 text-center">
                <div class="text-[9px] opacity-40 uppercase font-bold">Rate</div>
                <div class="text-xs font-mono font-bold text-teal-500">$${hourly}/hr</div>
            </div>
        </div>

        <details class="group">
            <summary class="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5 transition-colors">
                <span class="text-[9px] font-bold uppercase opacity-50 group-open:opacity-100 transition-opacity">Show Details</span>
                <i class="fa-solid fa-chevron-down text-[10px] opacity-50 group-open:rotate-180 transition-transform"></i>
            </summary>
            
            <div class="px-4 pb-4 space-y-3 text-xs border-t border-white/5 bg-black/10">
                <div class="flex justify-between items-end border-b border-white/5 pb-1 mt-2">
                    <span class="font-bold text-green-500">GROSS INCOME</span>
                    <span class="font-mono font-bold">${formatCurrency(gross)}</span>
                </div>
                <div class="space-y-1 pl-2 opacity-80">
                    ${income.map(i => `
                        <div class="flex justify-between">
                            <span class="capitalize opacity-60">${i.category}</span>
                            <span class="font-mono">${formatCurrency(i.amount)}</span>
                        </div>
                    `).join('')}
                    ${income.length === 0 ? '<div class="text-[9px] opacity-30 italic">No income logged</div>' : ''}
                </div>

                <div class="flex justify-between items-end border-b border-white/5 pb-1 mt-2">
                    <span class="font-bold text-red-500">EXPENSES</span>
                    <span class="font-mono font-bold text-red-400">-${formatCurrency(totalExp)}</span>
                </div>
                <div class="space-y-1 pl-2 opacity-80">
                    ${expense.map(e => `
                        <div class="flex justify-between">
                            <span class="capitalize opacity-60">${e.category} ${e.category === 'fuel' ? `(${e.gallons}g)` : ''}</span>
                            <span class="font-mono">-${formatCurrency(e.amount)}</span>
                        </div>
                    `).join('')}
                    ${expense.length === 0 ? '<div class="text-[9px] opacity-30 italic">No expenses</div>' : ''}
                </div>

                <div class="mt-3 pt-2 border-t border-white/10 flex justify-between text-[9px] font-mono opacity-40">
                    <span>CPM: $${cpm}/mi</span>
                    <span>RPM: $${rpm}/mi</span>
                </div>
            </div>
        </details>
    </div>
    `;
}

function renderTxCard(tx) {
    const isInc = tx.type === 'income';
    return `
        <div class="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl mx-2 opacity-75 hover:opacity-100 transition-opacity">
            <div class="flex items-center gap-3">
                <input type="checkbox" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500 focus:ring-0" value="tx:${tx.id}" onchange="updateDeleteButtonLocal()">
                <div class="w-8 h-8 rounded-lg ${isInc ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'} flex items-center justify-center text-xs">
                    <i class="fa-solid ${isInc ? 'fa-arrow-down-long' : 'fa-gas-pump'}"></i>
                </div>
                <div>
                    <div class="text-[9px] opacity-50 uppercase font-bold">${tx._date.toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'})}</div>
                    <div class="text-xs font-bold uppercase tracking-tight">${tx.category}</div>
                </div>
            </div>
            <div class="font-mono font-bold ${isInc ? 'text-green-500' : 'text-red-400'}">${isInc ? '+' : '-'}${formatCurrency(tx.amount)}</div>
        </div>
    `;
}

window.updateDeleteButtonLocal = () => {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    if (btn) btn.classList.toggle('hidden', checked.length === 0);
    const count = document.getElementById('delete-count');
    if (count) count.textContent = checked.length;
};
export function updateDeleteButtonLocal() { window.updateDeleteButtonLocal(); }
