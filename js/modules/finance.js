import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';

let currentHistory = [];

export function openTxModal(dir) {
    vibrate();
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Pajamos' : 'Išlaidos';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-type').value = '';
    document.getElementById('income-types').classList.toggle('hidden', dir !== 'in');
    document.getElementById('expense-types').classList.toggle('hidden', dir !== 'out');
    document.getElementById('fuel-fields').classList.add('hidden');
    document.querySelectorAll('.tx-type-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500'));
    document.getElementById('tx-modal').classList.remove('hidden');
}

export function setTxType(type, btn) {
    vibrate();
    document.getElementById('tx-type').value = type;
    btn.parentElement.querySelectorAll('.tx-type-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500'));
    btn.classList.add('bg-teal-500', 'text-black', 'border-teal-500');
    if (document.getElementById('fuel-fields')) {
        document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    }
}

export async function confirmTx() {
    vibrate(20);
    const amt = parseFloat(document.getElementById('tx-amount').value);
    const type = document.getElementById('tx-type').value;
    if(!amt || !type) return showToast('Pasirinkite tipą!', 'error');
    state.loading = true;
    try {
        if(state.txDirection === 'out') {
            await db.from('expenses').insert({
                type: type, amount: amt,
                gallons: parseFloat(document.getElementById('tx-gal')?.value || 0) || null,
                odometer: parseInt(document.getElementById('tx-odo')?.value || 0) || null
            });
            showToast('Išlaida įrašyta', 'success');
        } else {
            // JEI YRA AKTYVI PAMAINA (NET IR PAUSE) - pridedame prie jos
            if (state.activeShift) {
                await db.from('finance_shifts').update({ [type]: (state.activeShift[type] || 0) + amt }).eq('id', state.activeShift.id);
                showToast('Pajamos pridėtos prie pamainos!', 'success');
            } else {
                // JEI NĖRA PAMAINOS - sukuriam savarankišką įrašą (kad neblokuotų)
                await db.from('expenses').insert({ type: 'INCOME_' + type.toUpperCase(), amount: amt });
                showToast('Pajamos įrašytos (be pamainos)', 'success');
            }
        }
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function refreshAudit() {
    const { data: shifts } = await db.from('finance_shifts').select('*, vehicles(name)').eq('status', 'completed').order('end_time', {ascending: false}).limit(30);
    const { data: expenses } = await db.from('expenses').select('*').order('created_at', {ascending: false}).limit(30);

    let history = [];
    if (shifts) shifts.forEach(s => {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const diffMs = end - start;
        const miles = (s.end_odo && s.start_odo) ? (s.end_odo - s.start_odo) : 0;
        history.push({ 
            id: s.id, table: 'finance_shifts', date: end, amount: s.gross_earnings, type: 'PAMAINA', is_income: true, data: s,
            meta: {
                interval: `${start.getHours()}:${String(start.getMinutes()).padStart(2,'0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2,'0')}`,
                duration: `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`,
                miles: miles,
                efficiency: miles > 0 ? (s.gross_earnings / miles).toFixed(2) : '0.00'
            }
        });
    });
    if (expenses) expenses.forEach(e => history.push({ id: e.id, table: 'expenses', date: new Date(e.created_at), amount: e.amount, type: e.type.replace('INCOME_', ''), is_income: e.type.startsWith('INCOME_'), data: e }));

    history.sort((a, b) => b.date - a.date);
    currentHistory = history;
    const el = document.getElementById('audit-list');
    if(!el) return;

    let html = `
    <div class="flex justify-between items-center mb-3 px-1">
        <label class="flex items-center gap-2 text-[10px] font-bold text-gray-400 cursor-pointer">
            <input type="checkbox" id="hist-select-all" class="w-4 h-4 rounded bg-gray-700 border-gray-600"> SELECT ALL
        </label>
        <button id="hist-delete-btn" class="hidden bg-red-500/20 text-red-500 px-3 py-1 rounded text-[10px] font-bold border border-red-500/50">
            DELETE (<span id="hist-sel-count">0</span>)
        </button>
    </div>`;

    html += history.map(item => {
        const isS = item.table === 'finance_shifts';
        return `
        <div class="bento-card p-0 overflow-hidden border-white/5 mb-3 flex flex-col">
            <div class="flex items-center p-3 gap-3">
                <input type="checkbox" class="hist-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 text-teal-500" data-id="${item.id}" data-table="${item.table}">
                <button onclick="this.parentElement.nextElementSibling?.classList.toggle('hidden'); vibrate();" class="flex-1 text-left flex items-center justify-between">
                    <div>
                        <p class="text-[10px] font-black uppercase ${item.is_income ? 'text-teal-500' : 'text-red-400'} tracking-widest">${item.type}</p>
                        <p class="text-[10px] text-gray-500 font-mono">${item.date.toLocaleDateString()} ${isS ? '| ' + item.meta.duration : ''}</p>
                    </div>
                    <p class="font-mono font-bold text-lg ${item.is_income ? 'text-green-500' : 'text-red-400'}">$${item.amount}</p>
                </button>
                <button onclick="window.editItem('${item.id}')" class="p-2 text-gray-600 hover:text-teal-400">✏️</button>
            </div>
            ${isS ? `
            <div class="hidden bg-white/[0.02] border-t border-white/5 p-4 space-y-4 animate-slideUp text-white">
                <div class="grid grid-cols-2 gap-y-3 text-[11px]">
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">Laikas</span>${item.meta.interval}</div>
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">Auto</span>${item.data.vehicles?.name || '--'}</div>
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">Rida</span>${item.meta.miles} mi</div>
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">$/mi</span>$${item.meta.efficiency}</div>
                </div>
                <div class="border-t border-white/5 pt-3 flex justify-between text-[10px] font-mono">
                    <span>App: $${item.data.income_app}</span>
                    <span>Tips: $${item.data.income_cash}</span>
                    <span>Priv: $${item.data.income_private}</span>
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
    const checkboxes = document.querySelectorAll('.hist-checkbox');
    if(selectAll) selectAll.onclick = (e) => { checkboxes.forEach(cb => cb.checked = e.target.checked); updateBtn(); };
    checkboxes.forEach(cb => cb.onclick = () => updateBtn());
    function updateBtn() {
        const count = document.querySelectorAll('.hist-checkbox:checked').length;
        deleteBtn?.classList.toggle('hidden', count === 0);
        if(document.getElementById('hist-sel-count')) document.getElementById('hist-sel-count').textContent = count;
    }
    deleteBtn.onclick = async () => {
        if(!confirm('Delete selected?')) return;
        state.loading = true;
        try {
            const sel = Array.from(document.querySelectorAll('.hist-checkbox:checked')).map(cb => ({ id: cb.dataset.id, table: cb.dataset.table }));
            for (const i of sel) await db.from(i.table).delete().eq('id', i.id);
            window.dispatchEvent(new Event('refresh-data'));
        } catch(e) { showToast('Error'); } finally { state.loading = false; }
    };
}

export async function editItem(id) {
    vibrate();
    const item = currentHistory.find(i => i.id === id);
    if (!item) return;
    const modal = document.getElementById('edit-modal-dynamic');
    const input = document.getElementById('edit-val');
    const btn = document.getElementById('edit-confirm-btn');
    const isS = item.table === 'finance_shifts';
    document.getElementById('edit-subtitle').textContent = `${item.type} | ${item.date.toLocaleDateString()}`;
    input.value = isS ? item.data.income_app : item.amount;
    document.getElementById('edit-shift-fields').classList.toggle('hidden', !isS);
    if(isS) {
        document.getElementById('edit-tips').value = item.data.income_cash;
        document.getElementById('edit-private').value = item.data.income_private;
    }
    modal.classList.remove('hidden');
    btn.onclick = async () => {
        state.loading = true;
        try {
            let data = isS ? { income_app: parseFloat(input.value), income_cash: parseFloat(document.getElementById('edit-tips').value), income_private: parseFloat(document.getElementById('edit-private').value) } : { amount: parseFloat(input.value) };
            await db.from(item.table).update(data).eq('id', id);
            closeModals();
            window.dispatchEvent(new Event('refresh-data'));
        } catch(e) { showToast('DB Error'); } finally { state.loading = false; }
    };
}
