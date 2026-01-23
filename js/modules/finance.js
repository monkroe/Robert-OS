import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';

let currentHistory = [];

export function openTxModal(dir) {
    vibrate();
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Pajamos' : 'Išlaidos';
    document.getElementById('tx-modal').classList.remove('hidden');
}

export function setExpType(type) {
    vibrate();
    document.getElementById('tx-type').value = type;
    document.querySelectorAll('.exp-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black'));
    if (event) event.target.classList.add('bg-teal-500', 'text-black');
}

export async function confirmTx() {
    const amt = parseFloat(document.getElementById('tx-amount').value);
    if(!amt) return;
    try {
        if(state.txDirection === 'out') {
            await db.from('expenses').insert({ type: document.getElementById('tx-type').value, amount: amt });
        } else if (state.activeShift) {
            const field = confirm("Ar tai Tips/Grynieji?") ? 'income_cash' : 'income_app';
            await db.from('finance_shifts').update({ [field]: (state.activeShift[field] || 0) + amt }).eq('id', state.activeShift.id);
        }
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); }
}

export async function refreshAudit() {
    const { data: shifts } = await db.from('finance_shifts').select('*, vehicles(name)').eq('status', 'completed').order('end_time', {ascending: false}).limit(30);
    const { data: expenses } = await db.from('expenses').select('*').order('created_at', {ascending: false}).limit(30);

    let history = [];
    if (shifts) shifts.forEach(s => history.push({ id: s.id, table: 'finance_shifts', date: new Date(s.end_time), amount: s.gross_earnings, type: 'PAMAINA', is_income: true, data: s }));
    if (expenses) expenses.forEach(e => history.push({ id: e.id, table: 'expenses', date: new Date(e.created_at), amount: e.amount, type: e.type.toUpperCase(), is_income: false }));

    history.sort((a, b) => b.date - a.date);
    currentHistory = history;

    const el = document.getElementById('audit-list');
    if(!el) return;

    // ADMIN VALDYMAS
    let html = `
    <div class="flex justify-between items-center mb-3 px-1">
        <label class="flex items-center gap-2 text-[10px] font-bold text-gray-400 cursor-pointer">
            <input type="checkbox" id="hist-select-all" class="w-4 h-4 rounded bg-gray-700 border-gray-600"> SELECT ALL
        </label>
        <button id="hist-delete-btn" class="hidden bg-red-500/20 text-red-500 px-3 py-1 rounded text-[10px] font-bold border border-red-500/50">
            TRINTI (<span id="hist-sel-count">0</span>)
        </button>
    </div>`;

    html += history.map(item => {
        const isShift = item.table === 'finance_shifts';
        return `
        <div class="bento-card p-0 overflow-hidden border-white/5 mb-2 flex flex-col">
            <div class="flex items-center p-3 gap-3">
                <input type="checkbox" class="hist-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 focus:ring-teal-500 text-teal-500" data-id="${item.id}" data-table="${item.table}">
                
                <button onclick="this.parentElement.nextElementSibling?.classList.toggle('hidden'); vibrate();" class="flex-1 text-left flex items-center justify-between">
                    <div>
                        <p class="text-[10px] font-bold uppercase ${isShift ? 'text-teal-500' : 'text-red-400'}">${item.type}</p>
                        <p class="text-[10px] text-gray-500">${item.date.toLocaleDateString()} ${item.date.getHours()}:${String(item.date.getMinutes()).padStart(2,'0')}</p>
                    </div>
                    <p class="font-mono font-bold ${item.is_income ? 'text-green-500' : 'text-red-400'}">${item.is_income ? '+' : '-'}$${item.amount}</p>
                </button>

                <button onclick="window.editItem('${item.id}')" class="p-2 text-gray-500 hover:text-teal-400">✏️</button>
            </div>

            ${isShift ? `
            <div class="hidden bg-white/[0.02] border-t border-white/5 p-4 space-y-2 animate-slideUp">
                <div class="grid grid-cols-2 gap-4 text-[11px]">
                    <div><span class="text-gray-500 block">Auto:</span> ${item.data.vehicles?.name || '---'}</div>
                    <div><span class="text-gray-500 block">Sąlygos:</span> ${item.data.weather || 'Sunny'}</div>
                </div>
                <div class="border-t border-white/5 pt-2 flex justify-between text-[10px]">
                    <span>Uber: $${item.data.income_app}</span>
                    <span>Tips: $${item.data.income_cash}</span>
                    <span>Private: $${item.data.income_private}</span>
                </div>
            </div>` : ''}
        </div>`;
    }).join('');

    el.innerHTML = html;
    setupHistoryEvents();
}

function setupHistoryEvents() {
    const selectAll = document.getElementById('hist-select-all');
    const deleteBtn = document.getElementById('hist-delete-btn');
    const countSpan = document.getElementById('hist-sel-count');
    const checkboxes = document.querySelectorAll('.hist-checkbox');

    if(selectAll) selectAll.onclick = (e) => {
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateBtn();
    };

    checkboxes.forEach(cb => cb.onclick = () => updateBtn());

    async function updateBtn() {
        const count = document.querySelectorAll('.hist-checkbox:checked').length;
        deleteBtn.classList.toggle('hidden', count === 0);
        countSpan.textContent = count;
    }

    deleteBtn.onclick = async () => {
        if(!confirm('Ištrinti pasirinktus?')) return;
        const selected = Array.from(document.querySelectorAll('.hist-checkbox:checked')).map(cb => ({ id: cb.dataset.id, table: cb.dataset.table }));
        for (const item of selected) await db.from(item.table).delete().eq('id', item.id);
        window.dispatchEvent(new Event('refresh-data'));
    };
}

export async function editItem(id) {
    vibrate();
    const item = currentHistory.find(i => i.id === id);
    const newAmt = prompt(`Nauja suma ($) įrašui ${item.type}:`, item.amount);
    if (newAmt === null || isNaN(newAmt)) return;

    const field = item.table === 'finance_shifts' ? 'gross_earnings' : 'amount';
    await db.from(item.table).update({ [field]: parseFloat(newAmt) }).eq('id', id);
    window.dispatchEvent(new Event('refresh-data'));
}

export async function exportAI() {
    const { data: report } = await db.rpc('get_empire_report', { target_user_id: state.user.id });
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    showToast('Nukopijuota!', 'success');
}
