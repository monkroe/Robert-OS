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
    
    // Rodyti tik tam tikrus tipus
    document.getElementById('income-types').classList.toggle('hidden', dir !== 'in');
    document.getElementById('expense-types').classList.toggle('hidden', dir !== 'out');
    document.getElementById('fuel-fields').classList.add('hidden');
    
    // Nuimti senus pažymėjimus
    document.querySelectorAll('.tx-type-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500'));
    
    document.getElementById('tx-modal').classList.remove('hidden');
}

export function setTxType(type, btn) {
    vibrate();
    document.getElementById('tx-type').value = type;
    document.querySelectorAll('.tx-type-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500'));
    btn.classList.add('bg-teal-500', 'text-black', 'border-teal-500');
    
    if (document.getElementById('fuel-fields')) {
        document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    }
}

// ALIAS senam kodui, jei kur liko HTML
window.setExpType = (type, btn) => setTxType(type, btn);

export async function confirmTx() {
    vibrate(20);
    const amt = parseFloat(document.getElementById('tx-amount').value);
    const type = document.getElementById('tx-type').value;
    
    if(!amt || !type) return showToast('Užpildykite sumą ir pasirinkite tipą', 'error');
    
    state.loading = true;
    try {
        if(state.txDirection === 'out') {
            const { error } = await db.from('expenses').insert({
                type: type,
                amount: amt,
                gallons: parseFloat(document.getElementById('tx-gal')?.value || 0) || null,
                odometer: parseInt(document.getElementById('tx-odo')?.value || 0) || null
            });
            if(error) throw error;
            showToast('Išlaidos sėkmingai įrašytos', 'success');
        } else {
            if (!state.activeShift) throw new Error('Pajamos vedamos tik aktyvios pamainos metu');
            
            const { error } = await db.from('finance_shifts')
                .update({ [type]: (state.activeShift[type] || 0) + amt })
                .eq('id', state.activeShift.id);
                
            if(error) throw error;
            showToast('Pajamos sėkmingai pridėtos!', 'success');
        }
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function refreshAudit() {
    const { data: shifts, error: sErr } = await db.from('finance_shifts').select('*, vehicles(name)').eq('status', 'completed').order('end_time', {ascending: false}).limit(30);
    const { data: expenses, error: eErr } = await db.from('expenses').select('*').order('created_at', {ascending: false}).limit(30);

    let history = [];
    if (shifts) shifts.forEach(s => history.push({ id: s.id, table: 'finance_shifts', date: new Date(s.end_time), amount: s.gross_earnings, type: 'PAMAINA', is_income: true, data: s }));
    if (expenses) expenses.forEach(e => history.push({ id: e.id, table: 'expenses', date: new Date(e.created_at), amount: e.amount, type: e.type.toUpperCase(), is_income: false }));

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
            TRINTI (<span id="hist-sel-count">0</span>)
        </button>
    </div>`;

    html += history.map(item => {
        const isShift = item.table === 'finance_shifts';
        return `
        <div class="bento-card p-0 overflow-hidden border-white/5 mb-2 flex flex-col">
            <div class="flex items-center p-3 gap-3">
                <input type="checkbox" class="hist-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 text-teal-500" data-id="${item.id}" data-table="${item.table}">
                
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
            <div class="hidden bg-white/[0.02] border-t border-white/5 p-4 space-y-2 animate-slideUp text-white">
                <div class="grid grid-cols-2 gap-4 text-[11px]">
                    <div><span class="text-gray-500 block">Auto:</span> ${item.data.vehicles?.name || '---'}</div>
                    <div><span class="text-gray-500 block">Sąlygos:</span> ${item.data.weather || 'Normal'}</div>
                </div>
                <div class="border-t border-white/5 pt-2 flex justify-between text-[10px]">
                    <span>App: $${item.data.income_app || 0}</span>
                    <span>Tips: $${item.data.income_cash || 0}</span>
                    <span>Private: $${item.data.income_private || 0}</span>
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

    if(selectAll) selectAll.onclick = (e) => {
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateBtn();
    };
    checkboxes.forEach(cb => cb.onclick = () => updateBtn());

    function updateBtn() {
        const count = document.querySelectorAll('.hist-checkbox:checked').length;
        deleteBtn?.classList.toggle('hidden', count === 0);
        if(document.getElementById('hist-sel-count')) document.getElementById('hist-sel-count').textContent = count;
    }

    deleteBtn.onclick = async () => {
        if(!confirm('Ar tikrai ištrinti pasirinktus įrašus?')) return;
        state.loading = true;
        try {
            const selected = Array.from(document.querySelectorAll('.hist-checkbox:checked')).map(cb => ({ id: cb.dataset.id, table: cb.dataset.table }));
            for (const item of selected) await db.from(item.table).delete().eq('id', item.id);
            showToast('Įrašai ištrinti', 'success');
            window.dispatchEvent(new Event('refresh-data'));
        } catch(e) { showToast('Klaida trinant', 'error'); } finally { state.loading = false; }
    };
}

export async function editItem(id) {
    vibrate();
    const item = currentHistory.find(i => i.id === id);
    if (!item) return;

    // DINAMINIS MODALAS (Vietoj prompt)
    if(!document.getElementById('edit-modal-dynamic')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="edit-modal-dynamic" class="modal-overlay hidden">
                <div class="modal-content animate-slideUp">
                    <h3 class="text-xl font-bold uppercase mb-4 text-white">Redaguoti Sumą</h3>
                    <input type="number" id="edit-val" class="input-field text-2xl mb-6 text-center text-white">
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="document.getElementById('edit-modal-dynamic').classList.add('hidden')" class="btn-bento">Atšaukti</button>
                        <button id="edit-confirm-btn" class="btn-primary-os">SAVE</button>
                    </div>
                </div>
            </div>
        `);
    }

    const modal = document.getElementById('edit-modal-dynamic');
    const input = document.getElementById('edit-val');
    const btn = document.getElementById('edit-confirm-btn');

    input.value = item.amount;
    modal.classList.remove('hidden');

    btn.onclick = async () => {
        const newVal = parseFloat(input.value);
        if (isNaN(newVal)) return;

        state.loading = true;
        try {
            const field = item.table === 'finance_shifts' ? 'gross_earnings' : 'amount';
            const { error } = await db.from(item.table).update({ [field]: newVal }).eq('id', id);
            if(error) throw error;
            
            showToast('Sėkmingai atnaujinta!', 'success');
            modal.classList.add('hidden');
            window.dispatchEvent(new Event('refresh-data'));
        } catch(e) { showToast('Klaida saugant', 'error'); } finally { state.loading = false; }
    };
}

export async function exportAI() {
    state.loading = true;
    try {
        const { data: report } = await db.rpc('get_empire_report', { target_user_id: state.user.id });
        navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        showToast('Nukopijuota į Clipboard!', 'success');
    } catch(e) { showToast('Klaida kopijuojant', 'error'); } finally { state.loading = false; }
}
