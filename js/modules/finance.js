// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/FINANCE.JS v2.4.0 (CLEAN UI)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate, formatCurrency } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let txDraft = { direction: 'in', category: 'tips' };
let itemsToDelete = [];

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

        if (shifts.length === 0) {
            listEl.innerHTML = `<div class="py-12 text-center opacity-30 font-bold uppercase tracking-widest">Nėra duomenų</div>`;
            return;
        }

        window._auditData = { shifts, expenses }; 
        const groupedData = groupData(shifts, expenses);
        listEl.innerHTML = renderHierarchy(groupedData);
        
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div class="py-10 text-center text-danger font-bold">KLAIDA</div>';
    }
}

function groupData(shifts, expenses) {
    const years = {};
    const expensesByShift = {}; 

    // 1. Index Expenses (Smart Match)
    expenses.forEach(e => {
        if (e.shift_id) {
            const sid = String(e.shift_id);
            (expensesByShift[sid] = expensesByShift[sid] || []).push(e);
        }
    });

    // 2. Process Shifts
    shifts.forEach(shift => {
        const date = new Date(shift.start_time);
        const y = date.getFullYear();
        const m = date.getMonth();

        // Fallback: Jei nėra shift_id, galim bandyt priskirt pagal laiką (vėliau)
        // Dabar naudojam tik shift_id ryšį duomenų saugumui.

        if (!years[y]) years[y] = { net: 0, months: {} };
        if (!years[y].months[m]) years[y].months[m] = { net: 0, items: [] };

        const shiftExpenses = expensesByShift[String(shift.id)] || [];
        
        // Income = (App Earnings + Tips + Private)
        const income = shiftExpenses.filter(e => e.type === 'income').reduce((a, b) => a + b.amount, 0);
        // Expense = (Fuel + Food + etc)
        const expense = shiftExpenses.filter(e => e.type === 'expense').reduce((a, b) => a + b.amount, 0);
        
        // Jei Gross Earnings išsaugota shifte, naudojam ją kaip base
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
// RENDERERS (CLEAN BENTO)
// ────────────────────────────────────────────────────────────────

function renderHierarchy(data) {
    const monthsLT = ['SAUSIS', 'VASARIS', 'KOVAS', 'BALANDIS', 'GEGUŽĖ', 'BIRŽELIS', 'LIEPA', 'RUGPJŪTIS', 'RUGSĖJIS', 'SPALIS', 'LAPKRITIS', 'GRUODIS'];
    
    return Object.entries(data).sort((a, b) => b[0] - a[0]).map(([year, yearData]) => `
        <div class="mb-6">
            <div class="flex justify-between items-center px-2 mb-2 opacity-50 font-bold uppercase text-xs tracking-widest">
                <span>${year}</span>
                <span>${formatCurrency(yearData.net)}</span>
            </div>
            
            ${Object.entries(yearData.months).sort((a, b) => b[0] - a[0]).map(([mKey, monthData]) => `
                <div class="mb-4">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-xl font-bold text-accent">${monthsLT[mKey]}</span>
                        <div class="h-px bg-current opacity-10 flex-1"></div>
                        <span class="font-mono font-bold text-sm">${formatCurrency(monthData.net)}</span>
                    </div>
                    
                    <div class="space-y-3">
                        ${monthData.items.sort((a, b) => b._date - a._date).map(item => renderShiftStrip(item)).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderShiftStrip(s) {
    const tStart = new Date(s.start_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'});
    const tEnd = s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'}) : '...';
    
    const dist = (s.end_odo || 0) - (s.start_odo || 0);
    const durationMs = s.end_time ? (new Date(s.end_time) - new Date(s.start_time)) : 0;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const mins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    // Spalvos pagal pelną
    const colorClass = s.net >= 0 ? 'text-success' : 'text-danger';

    return `
    <div onclick="openShiftDetails('${s.id}')" class="shift-strip cursor-pointer">
        <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
                <i class="fa-solid fa-calendar-day text-accent text-xs"></i>
                <span class="text-xs font-bold uppercase opacity-70">${s._date.toLocaleDateString('lt-LT')}</span>
            </div>
            <div class="text-lg font-black tracking-tight mb-1">
                ${tStart} - ${tEnd} <span class="text-xs font-bold opacity-50 align-top">(${hours}h ${mins}m)</span>
            </div>
            <div class="flex gap-3 text-xs font-mono opacity-60">
                <span><i class="fa-solid fa-road mr-1"></i>${dist} mi</span>
                <span><i class="fa-solid fa-car mr-1"></i>${s.vehicles?.name || 'Car'}</span>
            </div>
        </div>

        <div class="text-right">
            <div class="text-xl font-black ${colorClass}">${formatCurrency(s.net)}</div>
            <div class="text-[9px] font-bold uppercase opacity-40">Net Profit</div>
        </div>
    </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// MODAL LOGIC (ASCII STYLE)
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
        <div class="flex justify-between items-start border-b border-dashed border-gray-500 pb-4 mb-4">
            <div>
                <h1 class="text-2xl font-black uppercase">${new Date(s.start_time).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'})}</h1>
                <div class="font-mono text-sm opacity-60">
                    ${new Date(s.start_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'})} - 
                    ${s.end_time ? new Date(s.end_time).toLocaleTimeString('lt-LT', {hour:'2-digit', minute:'2-digit'}) : '...'}
                </div>
            </div>
            <div class="text-right">
                <div class="text-xs font-bold uppercase opacity-50">Duration</div>
                <div class="font-mono font-bold">${Math.floor(hoursDec)}h ${Math.round((hoursDec%1)*60)}m</div>
            </div>
        </div>

        <div class="space-y-1 mb-6 font-mono text-sm">
            <div class="flex gap-2"><i class="fa-solid fa-road w-5 text-center opacity-50"></i> Distance: <b>${dist} mi</b></div>
            <div class="flex gap-2"><i class="fa-solid fa-car w-5 text-center opacity-50"></i> Vehicle: <b>${s.vehicles?.name}</b></div>
            <div class="flex gap-2"><i class="fa-solid fa-cloud w-5 text-center opacity-50"></i> Weather: <b>${s.weather || '-'}</b></div>
        </div>

        <div class="mb-4">
            <h3 class="text-xs font-bold uppercase text-success mb-2 border-b border-gray-700/20 pb-1">Earnings</h3>
            <div class="space-y-1 font-mono text-sm">
                ${income.length > 0 ? income.map(i => `
                    <div class="flex justify-between">
                        <span>├─ ${i.category}</span>
                        <span>${formatCurrency(i.amount)}</span>
                    </div>
                `).join('') : `<div class="flex justify-between"><span>├─ App Earnings</span><span>${formatCurrency(gross)}</span></div>`}
                <div class="flex justify-between font-bold pt-1 border-t border-dashed border-gray-700/20 mt-1">
                    <span>└─ TOTAL</span>
                    <span>${formatCurrency(gross)}</span>
                </div>
            </div>
        </div>

        <div class="mb-6">
            <h3 class="text-xs font-bold uppercase text-danger mb-2 border-b border-gray-700/20 pb-1">Expenses</h3>
            <div class="space-y-1 font-mono text-sm">
                ${expense.map(e => `
                    <div class="flex justify-between">
                        <span>├─ ${e.category} ${e.category==='fuel' ? `(${e.gallons}g)` : ''}</span>
                        <span>-${formatCurrency(e.amount)}</span>
                    </div>
                `).join('')}
                ${expense.length === 0 ? '<div class="text-xs opacity-40 italic">No expenses recorded</div>' : ''}
                <div class="flex justify-between font-bold pt-1 border-t border-dashed border-gray-700/20 mt-1">
                    <span>└─ TOTAL</span>
                    <span class="text-danger">-${formatCurrency(totalExp)}</span>
                </div>
            </div>
        </div>

        <div class="bg-input p-4 rounded-xl border border-gray-700/10">
            <div class="flex justify-between items-center mb-3">
                <span class="font-bold text-sm uppercase">Net Profit</span>
                <span class="text-2xl font-black ${net>=0?'text-success':'text-danger'}">${formatCurrency(net)}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-xs font-mono opacity-70">
                <div>
                    <div class="opacity-50">$/hr</div>
                    <div class="font-bold">$${hourly}</div>
                </div>
                <div class="border-l border-gray-500/20">
                    <div class="opacity-50">$/mi</div>
                    <div class="font-bold">$${perMile}</div>
                </div>
                <div class="border-l border-gray-500/20">
                    <div class="opacity-50">MPG</div>
                    <div class="font-bold">${mpg}</div>
                </div>
            </div>
        </div>
    `;

    const container = document.getElementById('shift-details-content');
    if (container) {
        container.innerHTML = html;
        openModal('shift-details-modal');
    }
}

// BINDINGS (Reikalingos HTML)
export function openTxModal(d) { openTxModal(d); } // Wrapper jei reikia, bet export veikia
// Transaction & Mgmt exports...
export function updateDeleteButtonLocal() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    if (btn) btn.classList.toggle('hidden', checked.length === 0);
    const count = document.getElementById('delete-count');
    if (count) count.textContent = checked.length;
}
