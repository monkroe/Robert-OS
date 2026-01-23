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
            const { error } = await db.from('expenses').insert({
                type: type, amount: amt,
                gallons: parseFloat(document.getElementById('tx-gal')?.value || 0) || null,
                odometer: parseInt(document.getElementById('tx-odo')?.value || 0) || null
            });
            if(error) throw error;
            showToast('Išlaida įrašyta', 'success');
        } else {
            if (!state.activeShift) throw new Error('Pajamos vedamos tik pamainos metu!');
            await db.from('finance_shifts').update({ [type]: (state.activeShift[type] || 0) + amt }).eq('id', state.activeShift.id);
            showToast('Pajamos pridėtos!', 'success');
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
    if (expenses) expenses.forEach(e => history.push({ id: e.id, table: 'expenses', date: new Date(e.created_at), amount: e.amount, type: e.type.toUpperCase(), is_income: false, data: e }));

    history.sort((a, b) => b.date - a.date);
    currentHistory = history;
    const el = document.getElementById('audit-list');
    if(!el) return;

    el.innerHTML = history.map(item => {
        const isS = item.table === 'finance_shifts';
        return `
        <div class="bento-card p-0 overflow-hidden border-white/5 flex flex-col">
            <div class="flex items-center p-3 gap-3">
                <button onclick="this.parentElement.nextElementSibling?.classList.toggle('hidden'); vibrate();" class="flex-1 text-left flex items-center justify-between">
                    <div>
                        <p class="text-[10px] font-black uppercase ${item.is_income ? 'text-teal-500' : 'text-red-400'} tracking-widest">${item.type}</p>
                        <p class="text-[10px] text-gray-500 font-mono">${item.date.toLocaleDateString()} ${isS ? '| ' + item.meta.duration : ''}</p>
                    </div>
                    <p class="font-mono font-bold text-lg ${item.is_income ? 'text-green-500' : 'text-red-400'}">${item.is_income ? '+' : '-'}$${item.amount}</p>
                </button>
                <button onclick="window.editItem('${item.id}')" class="p-2 text-gray-500 hover:text-teal-400">✏️</button>
            </div>
            ${isS ? `
            <div class="hidden bg-white/[0.02] border-t border-white/5 p-4 space-y-4 animate-slideUp text-white">
                <div class="grid grid-cols-2 gap-y-3 text-[11px]">
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">Laikas</span>${item.meta.interval}</div>
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">Auto</span>${item.data.vehicles?.name || '--'}</div>
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">Atstumas</span>${item.meta.miles} mi</div>
                    <div><span class="text-gray-500 block uppercase text-[9px] font-bold">$/mi</span>$${item.meta.efficiency}</div>
                </div>
                <div class="border-t border-white/5 pt-3 flex justify-between text-[10px] font-mono">
                    <span class="text-green-400">App: $${item.data.income_app}</span>
                    <span class="text-yellow-400">Tips: $${item.data.income_cash}</span>
                    <span class="text-blue-400">Priv: $${item.data.income_private}</span>
                </div>
            </div>` : ''}
        </div>`;
    }).join('');
}

export async function editItem(id) {
    vibrate();
    const item = currentHistory.find(i => i.id === id);
    if (!item) return;

    const modal = document.getElementById('edit-modal-dynamic');
    const input = document.getElementById('edit-val');
    const subtitle = document.getElementById('edit-subtitle');
    const shiftFields = document.getElementById('edit-shift-fields');
    const confirmBtn = document.getElementById('edit-confirm-btn');

    subtitle.textContent = `${item.type} | ${item.date.toLocaleDateString()}`;
    const isShift = item.table === 'finance_shifts';
    
    input.value = isShift ? item.data.income_app : item.amount;
    shiftFields.classList.toggle('hidden', !isShift);
    if(isShift) {
        document.getElementById('edit-tips').value = item.data.income_cash;
        document.getElementById('edit-private').value = item.data.income_private;
        document.getElementById('edit-main-label').textContent = "Uber / App Pajamos ($)";
    } else {
        document.getElementById('edit-main-label').textContent = "Bendra suma ($)";
    }

    modal.classList.remove('hidden');

    confirmBtn.onclick = async () => {
        state.loading = true;
        try {
            let updateData = {};
            if(isShift) {
                updateData = {
                    income_app: parseFloat(input.value || 0),
                    income_cash: parseFloat(document.getElementById('edit-tips').value || 0),
                    income_private: parseFloat(document.getElementById('edit-private').value || 0)
                };
            } else {
                updateData = { amount: parseFloat(input.value || 0) };
            }
            const { error } = await db.from(item.table).update(updateData).eq('id', id);
            if(error) throw error;
            showToast('Išsaugota!', 'success');
            closeModals();
            window.dispatchEvent(new Event('refresh-data'));
        } catch(e) { showToast('Klaida DB', 'error'); } finally { state.loading = false; }
    };
}

export async function exportAI() {
    vibrate();
    state.loading = true;
    try {
        const { data: report } = await db.rpc('get_empire_report', { target_user_id: state.user.id });
        navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        showToast('Nukopijuota!', 'success');
    } catch(e) { showToast('Klaida', 'error'); } finally { state.loading = false; }
}
