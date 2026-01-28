// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.6.1 (ASCII TREE MODAL)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

// ... [TRANSACTION LOGIC LIEKA TOKIA PATI KAIP BUVO] ...
export function openTxModal(dir, shiftId = null) {
    vibrate();
    txDraft.direction = dir;
    txDraft.category = dir === 'in' ? 'tips' : 'fuel';
    updateTxModalUI(dir);
    const inp = document.getElementById('tx-amount');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
    if (shiftId) document.getElementById('shift-details-modal').classList.add('hidden');
    openModal('tx-modal');
}

export async function confirmTx() {
    // ... [Standartinė logika] ...
    vibrate([20]);
    const amount = parseFloat(document.getElementById('tx-amount')?.value || 0);
    if (!amount || amount <= 0) return showToast('Įveskite sumą', 'warning');
    
    state.loading = true;
    try {
        let meta = {};
        if (txDraft.category === 'fuel') {
            meta.gallons = parseFloat(document.getElementById('tx-gal').value) || 0;
            meta.odometer = parseInt(document.getElementById('tx-odo').value) || 0;
        }
        await db.from('expenses').insert({
            user_id: state.user.id,
            shift_id: state.activeShift?.id || null,
            type: txDraft.direction === 'in' ? 'income' : 'expense',
            category: txDraft.category, amount, ...meta,
            created_at: new Date().toISOString()
        });
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); } 
    finally { state.loading = false; }
}

export function setExpType(cat, el) { /* ... */ 
    txDraft.category = cat;
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const f = document.getElementById('fuel-fields');
    if(f) cat === 'fuel' ? f.classList.remove('hidden') : f.classList.add('hidden');
}

function updateTxModalUI(dir) { /* ... */ 
    const t = document.getElementById('tx-title');
    if(t) t.textContent = dir === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';
    document.getElementById('income-types')?.classList.toggle('hidden', dir !== 'in');
    document.getElementById('expense-types')?.classList.toggle('hidden', dir === 'in');
    document.getElementById('fuel-fields')?.classList.add('hidden');
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

        if (!shifts.length) { listEl.innerHTML = '<div class="text-center py-10 opacity-30">Nėra duomenų</div>'; return; }

        window._auditData = { shifts, expenses }; // Cache
        const grouped = groupData(shifts, expenses);
        listEl.innerHTML = renderHierarchy(grouped);
        updateDeleteButtonLocal();
    } catch (e) { listEl.innerHTML = 'Klaida'; }
}

function groupData(shifts, expenses) {
    const years = {};
    const expensesByShift = {};
    expenses.forEach(e => { if(e.shift_id) (expensesByShift[e.shift_id] = expensesByShift[e.shift_id] || []).push(e); });

    shifts.forEach(shift => {
        const date = new Date(shift.start_time);
        const y = date.getFullYear();
        const m = date.getMonth();
        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[m]) years[y].months[m] = { net: 0, items: [] };

        const sExp = expensesByShift[shift.id] || [];
        const inc = sExp.filter(e => e.type === 'income').reduce((a,b)=>a+b.amount,0);
        const exp = sExp.filter(e => e.type === 'expense').reduce((a,b)=>a+b.amount,0);
        const gross = Math.max(inc, shift.gross_earnings || 0);
        const net = gross - exp;

        years[y].net += net;
        years[y].months[m].net += net;
        years[y].months[m].items.push({ ...shift, _date: date, sExp, net, gross, exp });
    });
    return years;
}

// ────────────────────────────────────────────────────────────────
// RENDERERS
// ────────────────────────────────────────────────────────────────

function renderHierarchy(data) {
    const monthsLT = ['SAUSIS','VASARIS','KOVAS','BALANDIS','GEGUŽĖ','BIRŽELIS','LIEPA','RUGPJŪTIS','RUGSĖJIS','SPALIS','LAPKRITIS','GRUODIS'];
    return Object.entries(data).sort((a,b)=>b[0]-a[0]).map(([y, yD]) => `
        <div class="mb-4">
            <div class="flex justify-between px-2 text-xs opacity-50 font-bold mb-2"><span>${y}</span><span>${formatCurrency(yD.net)}</span></div>
            ${Object.entries(yD.months).sort((a,b)=>b[0]-a[0]).map(([m, mD]) => `
                <div class="mb-2">
                    <div class="px-2 text-teal-500 font-bold text-xs mb-1 uppercase tracking-widest">${monthsLT[m]}</div>
                    ${mD.items.sort((a,b)=>b._date-a._date).map(s => renderShiftStrip(s)).join('')}
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderShiftStrip(s) {
    const t1 = new Date(s.start_time).toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'});
    const t2 = s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'}) : '...';
    return `
    <div onclick="openShiftDetails('${s.id}')" class="shift-strip cursor-pointer bg-white/5 border border-white/10 rounded-xl p-3 mb-2 flex justify-between items-center">
        <div class="flex items-center gap-3">
            <input type="checkbox" onclick="event.stopPropagation(); updateDeleteButtonLocal()" value="shift:${s.id}" class="log-checkbox w-5 h-5 rounded border-gray-600 bg-transparent text-teal-500">
            <div>
                <div class="text-[10px] opacity-50 font-bold uppercase">${s._date.toLocaleDateString('lt-LT')}</div>
                <div class="text-sm font-bold">${t1} - ${t2}</div>
            </div>
        </div>
        <div class="font-bold ${s.net>=0?'text-green-400':'text-red-400'}">${formatCurrency(s.net)}</div>
    </div>`;
}

// ────────────────────────────────────────────────────────────────
// MODAL LOGIC (ASCII TREE)
// ────────────────────────────────────────────────────────────────

export function openShiftDetails(id) {
    vibrate([10]);
    const s = window._auditData.shifts.find(x => String(x.id) === String(id));
    if (!s) return;
    const sExp = window._auditData.expenses.filter(e => String(e.shift_id) === String(id));
    const income = sExp.filter(e => e.type === 'income');
    const expense = sExp.filter(e => e.type === 'expense');
    
    // Calcs
    const gross = Math.max(income.reduce((a,b)=>a+b.amount,0), s.gross_earnings||0);
    const totalExp = expense.reduce((a,b)=>a+b.amount,0);
    const net = gross - totalExp;
    
    const dist = (s.end_odo||0) - (s.start_odo||0);
    const dur = new Date(s.end_time||new Date()) - new Date(s.start_time);
    const hrs = Math.max(0.1, dur/(1000*60*60));
    
    // Fuel stats
    const fuel = expense.find(e => e.category==='fuel');
    const gal = fuel ? (parseFloat(fuel.gallons)||0) : 0;
    const mpg = (gal>0 && dist>0) ? (dist/gal).toFixed(1) : '—';
    const cpm = dist>0 ? (totalExp/dist).toFixed(2) : '0.00';

    // ASCII Template
    const html = `
        <div class="shift-details-tree text-sm font-mono leading-relaxed">
            <div class="mb-4 pb-2 border-b border-dashed border-white/20">
                <div class="font-bold text-lg">🚗 ${s.vehicles?.name || 'Unknown'}</div>
                <div class="opacity-50 text-xs">${new Date(s.start_time).toLocaleDateString('lt-LT')}</div>
            </div>

            <div class="mb-4">
                <div class="tree-row"><span class="tree-label">SHIFT DETAILS</span></div>
                <div class="ml-2 border-l border-white/20 pl-2">
                    <div class="tree-row"><span>├─ Duration:</span> <span class="tree-val">${Math.floor(hrs)}h ${Math.round((hrs%1)*60)}m</span></div>
                    <div class="tree-row"><span>├─ Distance:</span> <span class="tree-val">${dist} mi</span></div>
                    <div class="tree-row"><span>└─ Weather:</span> <span class="tree-val">${s.weather||'—'}</span></div>
                </div>
            </div>

            <div class="mb-4">
                <div class="tree-row text-green-400 font-bold">💰 EARNINGS</div>
                <div class="ml-2 border-l border-white/20 pl-2">
                    ${income.length ? income.map(i => `
                        <div class="tree-row"><span>├─ ${i.category}:</span> <span class="tree-val">$${i.amount}</span></div>
                    `).join('') : `<div class="tree-row"><span>├─ App:</span> <span class="tree-val">$${gross}</span></div>`}
                    <div class="tree-row mt-1 pt-1 border-t border-dashed border-white/10">
                        <span>└─ TOTAL:</span> <span class="tree-val text-green-400">$${gross}</span>
                    </div>
                </div>
            </div>

            <div class="mb-4">
                <div class="tree-row text-red-400 font-bold">💸 EXPENSES</div>
                <div class="ml-2 border-l border-white/20 pl-2">
                    ${expense.length ? expense.map(e => `
                        <div class="tree-row">
                            <span>├─ ${e.category} ${e.category==='fuel' ? `(${e.gallons}g)` : ''}:</span> 
                            <span class="tree-val">-$${e.amount}</span>
                        </div>
                    `).join('') : '<div class="tree-row opacity-50">└─ None</div>'}
                    
                    ${expense.length ? `
                    <div class="tree-row mt-1 pt-1 border-t border-dashed border-white/10">
                        <span>└─ TOTAL:</span> <span class="tree-val text-red-400">-$${totalExp}</span>
                    </div>` : ''}
                </div>
            </div>

            <div class="bg-white/5 p-3 rounded-lg border border-white/10">
                <div class="tree-row font-bold text-lg mb-2">
                    <span>📈 NET:</span> <span class="${net>=0?'text-green-400':'text-red-400'}">$${net.toFixed(2)}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center text-xs opacity-70">
                    <div>$/hr: <b>$${(net/hrs).toFixed(2)}</b></div>
                    <div>$/mi: <b>$${(net/Math.max(1,dist)).toFixed(2)}</b></div>
                    <div>MPG: <b>${mpg}</b></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('shift-details-content').innerHTML = html;
    openModal('shift-details-modal');
}

// DELETE LOGIC (ONLY VIA MAIN LIST, NOT MODAL)
export function toggleSelectAll() { /* ... */ }
export function requestLogDelete() { 
    const checked = document.querySelectorAll('.log-checkbox:checked');
    if(checked.length) {
        itemsToDelete = Array.from(checked).map(el => ({type:el.value.split(':')[0], id:el.value.split(':')[1]}));
        document.getElementById('del-modal-count').textContent = itemsToDelete.length;
        openModal('delete-modal');
    }
}
export async function confirmLogDelete() { 
    state.loading = true;
    try {
        const sIds = itemsToDelete.filter(i=>i.type==='shift').map(i=>i.id);
        const tIds = itemsToDelete.filter(i=>i.type==='tx').map(i=>i.id);
        if(sIds.length) { await db.from('expenses').delete().in('shift_id', sIds); await db.from('finance_shifts').delete().in('id', sIds); }
        if(tIds.length) await db.from('expenses').delete().in('id', tIds);
        closeModals(); refreshAudit();
    } catch(e){ showToast('Error', 'error'); } finally { state.loading=false; }
}
export function updateDeleteButtonLocal() {
    const c = document.querySelectorAll('.log-checkbox:checked').length;
    document.getElementById('btn-delete-logs').classList.toggle('hidden', c===0);
    document.getElementById('delete-count').textContent = c;
}
export function exportAI() {}
