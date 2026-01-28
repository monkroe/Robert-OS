// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.5.0
// Logic: Restored Dark UI & Advanced Analytics
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let targetShiftId = null; 
let itemsToDelete = [];

// ────────────────────────────────────────────────────────────────
// TRANSACTION LOGIC
// ────────────────────────────────────────────────────────────────

export function openTxModal(dir, shiftId = null) {
    vibrate();
    txDraft.direction = dir;
    txDraft.category = dir === 'in' ? 'tips' : 'fuel';
    targetShiftId = shiftId; // Jei nustatyta, priskirsime konkrečiai pamainai

    updateTxModalUI(dir);
    
    const inp = document.getElementById('tx-amount');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
    
    // Jei atidarome iš detalaus vaizdo, laikinai paslepiame jį
    if (shiftId) document.getElementById('shift-details-modal').classList.add('hidden');
    
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

        // Prioritetas: Target Shift (Redagavimas) -> Active Shift (Dabar) -> Null (Bendras)
        const finalShiftId = targetShiftId || state.activeShift?.id || null;

        await recordTransaction(txDraft.direction === 'in' ? 'income' : 'expense', {
            amount, 
            category: txDraft.category, 
            meta,
            shiftId: finalShiftId
        });

        closeModals();
        targetShiftId = null;
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        state.loading = false;
    }
}

async function recordTransaction(type, { amount, category, meta, shiftId }) {
    if (!state.user?.id) throw new Error('User offline');

    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: shiftId,
        vehicle_id: null, // Supaprastinta logika, užtenka shift ryšio
        type, category, amount, ...meta,
        created_at: new Date().toISOString()
    });

    if (error) throw error;
    showToast('IŠSAUGOTA', 'success');
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
    if(t) t.textContent = targetShiftId ? (dir === 'in' ? 'ADD INCOME' : 'ADD EXPENSE') : (dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS');
    
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
            listEl.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 opacity-30">
                    <i class="fa-solid fa-folder-open text-4xl mb-4"></i>
                    <span class="text-xs font-bold uppercase tracking-widest">Istorija tuščia</span>
                </div>`;
            return;
        }

        // Global Cache for Modals
        window._auditData = { shifts, expenses }; 
        
        const groupedData = groupData(shifts, expenses);
        listEl.innerHTML = renderHierarchy(groupedData);
        updateDeleteButtonLocal();
        
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div class="py-10 text-center text-red-500 font-bold text-xs">KLAIDA GENERUOJANT ATASKAITĄ</div>';
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

        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[m]) years[y].months[m] = { net: 0, items: [] };

        const shiftExpenses = expensesByShift[String(shift.id)] || [];
        const income = shiftExpenses.filter(e => e.type === 'income').reduce((a, b) => a + b.amount, 0);
        const expense = shiftExpenses.filter(e => e.type === 'expense').reduce((a, b) => a + b.amount, 0);
        
        // Logic: Gross = Didžiausia vertė tarp (Pajamų įrašų) ir (Base Earnings iš shift lentelės)
        const grossTotal = Math.max(income, shift.gross_earnings || 0);
        const net = grossTotal - expense;

        years[y].net += net;
        years[y].months[m].net += net;
        
        years[y].months[m].items.push({ 
            ...shift, 
            _date: date, 
            shiftExpenses, 
            net,
            grossTotal,
            totalExpense: expense
        });
    });

    return years;
}

// ────────────────────────────────────────────────────────────────
// RENDERERS (STYLE RESTORED)
// ────────────────────────────────────────────────────────────────

function renderHierarchy(data) {
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
                        <div class="flex justify-between items-center px-2 py-2 mb-1">
                            <span class="text-[10px] font-bold text-teal-500 tracking-widest uppercase">${monthsLT[mKey]}</span>
                            <span class="text-[10px] font-mono opacity-50">${formatCurrency(monthData.net)}</span>
                        </div>
                        <div class="space-y-2">
                            ${monthData.items.sort((a, b) => b._date - a._date).map(item => renderShiftStrip(item)).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </details>
    `).join('');
}

function renderShiftStrip(s) {
    const tStart = new Date(s.start_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'});
    const dist = (s.end_odo || 0) - (s.start_odo || 0);
    const colorClass = s.net >= 0 ? 'text-green-400' : 'text-red-400';

    return `
    <div onclick="openShiftDetails('${s.id}')" class="shift-strip cursor-pointer hover:bg-white/10 transition-colors relative">
        <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-3">
                <input type="checkbox" onclick="event.stopPropagation(); updateDeleteButtonLocal()" value="shift:${s.id}" class="log-checkbox w-5 h-5 rounded border-gray-700 bg-black text-teal-500 focus:ring-0">
                <div>
                    <div class="text-[10px] opacity-50 uppercase font-bold tracking-wider mb-0.5">
                        ${s._date.toLocaleDateString('lt-LT')} • ${s.vehicles?.name || 'Car'}
                    </div>
                    <div class="text-sm font-black tracking-tight flex items-center gap-2">
                        ${tStart}
                        <span class="text-[9px] bg-white/10 px-1.5 py-0.5 rounded opacity-60 font-mono">${dist} mi</span>
                    </div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-lg font-black ${colorClass}">${formatCurrency(s.net)}</div>
                <div class="text-[9px] opacity-40 font-bold uppercase">NET</div>
            </div>
        </div>
    </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// DETAIL MODAL LOGIC (ASCII STYLE)
// ────────────────────────────────────────────────────────────────

export function openShiftDetails(id) {
    vibrate([10]);
    const allShifts = window._auditData?.shifts || [];
    const allExpenses = window._auditData?.expenses || [];
    
    const s = allShifts.find(x => String(x.id) === String(id));
    if (!s) return showToast('Error', 'error');

    const sExp = allExpenses.filter(e => String(e.shift_id) === String(id));
    const income = sExp.filter(e => e.type === 'income');
    const expense = sExp.filter(e => e.type === 'expense');

    // Calculations
    const gross = Math.max(income.reduce((a, b) => a + b.amount, 0), s.gross_earnings || 0);
    const totalExp = expense.reduce((a, b) => a + b.amount, 0);
    const net = gross - totalExp;
    
    const dist = (s.end_odo || 0) - (s.start_odo || 0);
    const fuelItem = expense.find(e => e.category === 'fuel');
    const gallons = fuelItem ? (parseFloat(fuelItem.gallons) || 0) : 0;
    const mpg = (gallons > 0 && dist > 0) ? (dist / gallons).toFixed(1) : 'N/A';
    
    const durationMs = new Date(s.end_time || new Date()) - new Date(s.start_time);
    const hoursDec = Math.max(0.1, durationMs / (1000 * 60 * 60));
    const hourly = (net / hoursDec).toFixed(2);
    const perMile = dist > 0 ? (net / dist).toFixed(2) : '0.00';

    const html = `
        <div class="text-center mb-6">
            <h2 class="text-2xl font-black uppercase tracking-tighter mb-1">${s.vehicles?.name || 'Unknown'}</h2>
            <div class="text-xs font-bold opacity-50 uppercase tracking-widest">${new Date(s.start_time).toLocaleDateString('lt-LT')}</div>
        </div>

        <div class="space-y-4">
            
            <div>
                <div class="flex justify-between items-end border-b border-white/10 pb-1 mb-2">
                    <span class="text-xs font-bold text-green-500 uppercase">Earnings</span>
                    <span class="font-mono font-bold">${formatCurrency(gross)}</span>
                </div>
                ${income.map(i => `
                    <div class="flex justify-between text-xs py-1 font-mono opacity-70">
                        <span class="capitalize">${i.category}</span>
                        <span>${formatCurrency(i.amount)}</span>
                    </div>
                `).join('')}
                ${income.length === 0 ? '<div class="text-[9px] opacity-30 italic">No detailed records</div>' : ''}
            </div>

            <div>
                <div class="flex justify-between items-end border-b border-white/10 pb-1 mb-2">
                    <span class="text-xs font-bold text-red-500 uppercase">Expenses</span>
                    <span class="font-mono font-bold text-red-400">-${formatCurrency(totalExp)}</span>
                </div>
                ${expense.map(e => `
                    <div class="flex justify-between text-xs py-1 font-mono opacity-70">
                        <span class="capitalize">${e.category} ${e.category==='fuel' ? `(${e.gallons}g)` : ''}</span>
                        <span>-${formatCurrency(e.amount)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="bg-white/5 rounded-xl p-4 mt-4 border border-white/5">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-[10px] font-bold opacity-40 uppercase">Net Profit</span>
                    <span class="text-xl font-black text-green-400">${formatCurrency(net)}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
                    <div><div class="text-[9px] opacity-30 uppercase">Per Hour</div><div class="text-xs font-mono font-bold text-teal-500">$${hourly}</div></div>
                    <div><div class="text-[9px] opacity-30 uppercase">Per Mile</div><div class="text-xs font-mono font-bold text-blue-500">$${perMile}</div></div>
                    <div><div class="text-[9px] opacity-30 uppercase">MPG</div><div class="text-xs font-mono font-bold text-yellow-500">${mpg}</div></div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-white/10">
            <button onclick="openTxModal('out', '${s.id}')" class="py-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-[10px] font-bold uppercase text-red-500 tracking-wider transition-colors">
                <i class="fa-solid fa-plus mr-1"></i> Add Exp
            </button>
            <button onclick="deleteShift('${s.id}')" class="py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase opacity-50 hover:opacity-100 tracking-wider transition-colors">
                <i class="fa-solid fa-trash mr-1"></i> Delete
            </button>
        </div>
        <button onclick="openTxModal('in', '${s.id}')" class="w-full mt-2 py-3 bg-green-500/10 hover:bg-green-500/20 rounded-xl text-[10px] font-bold uppercase text-green-500 tracking-wider transition-colors">
            <i class="fa-solid fa-plus mr-1"></i> Add Income
        </button>
    `;

    const container = document.getElementById('shift-details-content');
    if (container) {
        container.innerHTML = html;
        openModal('shift-details-modal');
    }
}

export async function deleteShift(id) {
    if(!confirm("Ištrinti šią pamainą visam laikui?")) return;
    
    state.loading = true;
    try {
        await db.from('expenses').delete().eq('shift_id', id);
        const { error } = await db.from('finance_shifts').delete().eq('id', id);
        if (error) throw error;
        
        showToast('IŠTRINTA', 'success');
        closeModals();
        await refreshAudit();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) {
        showToast(e.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// HELPERS
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
        showToast('IŠTRINTA', 'success');
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

export function exportAI() { showToast('AI EXPORT v2.5 COMING SOON', 'info'); }
