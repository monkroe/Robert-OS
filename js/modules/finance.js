// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.3.1 (HOTFIX)
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
        await recordTransaction(txDraft.direction === 'in' ? 'income' : 'expense', { amount, category: txDraft.category, meta });
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch (err) { showToast(err.message, 'error'); } 
    finally { state.loading = false; }
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
// AUDIT ENGINE
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
            listEl.innerHTML = `<div class="py-12 text-center opacity-30 text-xs font-bold uppercase tracking-widest">Istorija tuščia</div>`;
            return;
        }

        // Globali prieiga detalėms
        window._auditData = { shifts, expenses }; 
        
        const groupedData = groupData(shifts, expenses);
        listEl.innerHTML = renderHierarchy(groupedData);
        updateDeleteButtonLocal();
        
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div class="py-10 text-center text-red-500 text-xs">KLAIDA</div>';
    }
}

function groupData(shifts, expenses) {
    const years = {};
    const expensesByShift = {}; 

    expenses.forEach(e => {
        if (e.shift_id) {
            const sid = String(e.shift_id);
            (expensesByShift[sid] = expensesByShift[sid] || []).push(e);
        }
    });

    shifts.forEach(shift => {
        const date = new Date(shift.start_time);
        const y = date.getFullYear();
        const m = date.getMonth();
        const start = new Date(y, 0, 1);
        const days = Math.floor((date - start) / (24 * 60 * 60 * 1000));
        const w = Math.ceil((days + 1) / 7);

        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[m]) years[y].months[m] = { net: 0, weeks: {} };
        if (!years[y].months[m].weeks[w]) years[y].months[m].weeks[w] = { net: 0, items: [] };

        const shiftExpenses = expensesByShift[String(shift.id)] || [];
        const shiftNet = shiftExpenses.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);

        years[y].net += shiftNet;
        years[y].months[m].net += shiftNet;
        years[y].months[m].weeks[w].net += shiftNet;
        
        years[y].months[m].weeks[w].items.push({ 
            ...shift, _kind: 'shift', _date: date, shiftExpenses, shiftNet 
        });
    });

    return years;
}

function renderHierarchy(data) {
    const monthsLT = ['SAUSIS', 'VASARIS', 'KOVAS', 'BALANDIS', 'GEGUŽĖ', 'BIRŽELIS', 'LIEPA', 'RUGPJŪTIS', 'RUGSĖJIS', 'SPALIS', 'LAPKRITIS', 'GRUODIS'];
    
    return Object.entries(data).sort((a, b) => b[0] - a[0]).map(([year, yearData]) => `
        <details class="group mb-4" open>
            <summary class="flex justify-between items-center p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer list-none">
                <span class="text-xl font-black tracking-tighter">${year}</span>
                <span class="font-mono font-bold ${yearData.net >= 0 ? 'text-teal-400' : 'text-red-400'}">${formatCurrency(yearData.net)}</span>
            </summary>
            <div class="mt-2 pl-2 border-l border-white/10 ml-4 space-y-2">
                ${Object.entries(yearData.months).sort((a, b) => b[0] - a[0]).map(([mKey, monthData]) => `
                    <details class="group/month">
                        <summary class="flex justify-between items-center p-3 bg-white/5 rounded-xl cursor-pointer list-none hover:bg-white/10">
                            <span class="text-xs font-bold text-teal-500 tracking-widest">${monthsLT[mKey]}</span>
                            <span class="text-xs font-mono font-bold">${formatCurrency(monthData.net)}</span>
                        </summary>
                        <div class="mt-2 pl-2 space-y-2">
                            ${Object.entries(monthData.weeks).sort((a, b) => b[0] - a[0]).map(([wKey, weekData]) => `
                                <div class="bg-black/20 rounded-xl p-2">
                                    <div class="text-[9px] font-bold opacity-30 uppercase mb-2 ml-1">Week ${wKey} • ${formatCurrency(weekData.net)}</div>
                                    ${weekData.items.sort((a, b) => b._date - a._date).map(item => renderShiftStrip(item)).join('')}
                                </div>
                            `).join('')}
                        </div>
                    </details>
                `).join('')}
            </div>
        </details>
    `).join('');
}

function renderShiftStrip(s) {
    const tStart = new Date(s.start_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'});
    const tEnd = s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'}) : 'Active';
    const dist = (s.end_odo || 0) - (s.start_odo || 0);
    const durationMs = s.end_time ? (new Date(s.end_time) - new Date(s.start_time)) : 0;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const mins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    // ✅ PATAISYMAS: onclick kviečia globalią funkciją, kurią pririšime app.js
    return `
    <div onclick="openShiftDetails('${s.id}')" class="relative bg-white/5 border border-white/5 rounded-lg p-3 mb-2 hover:bg-white/10 transition-all cursor-pointer active:scale-95">
        <div class="flex justify-between items-start pointer-events-none">
            <div>
                <div class="text-[10px] font-bold text-teal-500 uppercase tracking-wider mb-0.5">
                    ${s._date.toLocaleDateString('lt-LT')} • ${tStart} - ${tEnd} (${hours}h ${mins}m)
                </div>
                <div class="text-xs font-bold text-white opacity-80">
                    Shift Details
                </div>
                <div class="text-[9px] opacity-50 mt-1 font-mono">
                    Dist: ${dist} mi
                </div>
            </div>
            <div class="text-right">
                <div class="text-sm font-black ${s.shiftNet >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(s.shiftNet)}</div>
            </div>
        </div>
        <div class="absolute bottom-2 right-2 pointer-events-auto" onclick="event.stopPropagation()">
             <input type="checkbox" onchange="updateDeleteButtonLocal()" value="shift:${s.id}" class="log-checkbox w-4 h-4 rounded border-gray-700 bg-black text-teal-500 opacity-30 hover:opacity-100">
        </div>
    </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// DETAILED MODAL LOGIC (EXPORTED)
// ────────────────────────────────────────────────────────────────

// ✅ PATAISYMAS: Eksportuojame funkciją, kad app.js galėtų ją pririšti
export function openShiftDetails(id) {
    vibrate([10]);
    const allShifts = window._auditData?.shifts || [];
    const allExpenses = window._auditData?.expenses || [];
    
    const s = allShifts.find(x => String(x.id) === String(id));
    if (!s) return showToast('Error loading details', 'error');

    const sExp = allExpenses.filter(e => String(e.shift_id) === String(id));
    const income = sExp.filter(e => e.type === 'income');
    const expense = sExp.filter(e => e.type === 'expense');

    const gross = income.reduce((a, b) => a + b.amount, 0);
    const totalExp = expense.reduce((a, b) => a + b.amount, 0);
    const net = gross - totalExp;
    
    const dist = (s.end_odo || 0) - (s.start_odo || 0);
    const fuelItem = expense.find(e => e.category === 'fuel');
    const gallons = fuelItem ? (parseFloat(fuelItem.gallons) || 0) : 0;
    const mpg = (gallons > 0 && dist > 0) ? (dist / gallons).toFixed(1) : 'N/A';
    
    const durationMs = new Date(s.end_time || new Date()) - new Date(s.start_time);
    const hoursDec = Math.max(0.1, durationMs / (1000 * 60 * 60));
    const hourly = (net / hoursDec).toFixed(2);

    const html = `
        <div class="text-center mb-6">
            <h2 class="text-2xl font-black uppercase tracking-tighter mb-1">${s.vehicles?.name || 'Unknown Car'}</h2>
            <div class="text-xs font-bold opacity-50 uppercase tracking-widest">${new Date(s.start_time).toLocaleDateString('lt-LT')}</div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="p-3 bg-white/5 rounded-xl border border-white/10 text-center">
                <div class="text-[9px] opacity-40 uppercase font-bold">Duration</div>
                <div class="text-lg font-mono font-bold">${Math.floor(hoursDec)}h ${Math.round((hoursDec % 1)*60)}m</div>
            </div>
            <div class="p-3 bg-white/5 rounded-xl border border-white/10 text-center">
                <div class="text-[9px] opacity-40 uppercase font-bold">Distance</div>
                <div class="text-lg font-mono font-bold">${dist} mi</div>
            </div>
        </div>

        <div class="space-y-4">
            <div>
                <div class="flex justify-between items-end border-b border-white/10 pb-1 mb-2">
                    <span class="text-xs font-bold text-green-500 uppercase">Earnings</span>
                    <span class="font-mono font-bold">${formatCurrency(gross)}</span>
                </div>
                ${income.map(i => `
                    <div class="flex justify-between text-xs py-1">
                        <span class="opacity-60 capitalize">${i.category}</span>
                        <span class="font-mono">${formatCurrency(i.amount)}</span>
                    </div>
                `).join('')}
            </div>

            <div>
                <div class="flex justify-between items-end border-b border-white/10 pb-1 mb-2">
                    <span class="text-xs font-bold text-red-500 uppercase">Expenses</span>
                    <span class="font-mono font-bold text-red-400">-${formatCurrency(totalExp)}</span>
                </div>
                ${expense.map(e => `
                    <div class="flex justify-between text-xs py-1">
                        <span class="opacity-60 capitalize">${e.category} ${e.category==='fuel' ? `(${e.gallons}g)` : ''}</span>
                        <span class="font-mono">-${formatCurrency(e.amount)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="bg-black/30 rounded-xl p-4 mt-4 border border-white/5">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-[10px] font-bold opacity-40 uppercase">Net Profit</span>
                    <span class="text-xl font-black text-green-400">${formatCurrency(net)}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
                    <div><div class="text-[9px] opacity-30 uppercase">Per Hour</div><div class="text-xs font-mono font-bold text-teal-500">$${hourly}</div></div>
                    <div><div class="text-[9px] opacity-30 uppercase">Per Mile</div><div class="text-xs font-mono font-bold text-blue-500">$${(net/Math.max(1,dist)).toFixed(2)}</div></div>
                    <div><div class="text-[9px] opacity-30 uppercase">MPG</div><div class="text-xs font-mono font-bold text-yellow-500">${mpg}</div></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('shift-details-content').innerHTML = html;
    openModal('shift-details-modal');
}

// ────────────────────────────────────────────────────────────────
// DELETE LOGIC (EXPORTED)
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

export function updateDeleteButtonLocal() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    document.getElementById('btn-delete-logs')?.classList.toggle('hidden', checked.length === 0);
    const c = document.getElementById('delete-count'); if(c) c.textContent = checked.length;
}
