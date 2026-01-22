import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';
// IŠTRINTAS 'refreshAll' importas

export function openTxModal(dir) {
    vibrate();
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Pajamos' : 'Išlaidos';
    document.getElementById('tx-amount').value = '';
    
    const isExp = dir === 'out';
    document.getElementById('expense-types').classList.toggle('hidden', !isExp);
    document.getElementById('fuel-fields').classList.add('hidden');
    
    document.getElementById('tx-modal').classList.remove('hidden');
}

export function setExpType(type) {
    vibrate();
    document.getElementById('tx-type').value = type;
    document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    document.querySelectorAll('.exp-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black'));
    event.target.classList.add('bg-teal-500', 'text-black');
}

export async function confirmTx() {
    vibrate([20]);
    const amt = parseFloat(document.getElementById('tx-amount').value);
    if(!amt) return;
    
    state.loading = true;
    try {
        if(state.txDirection === 'out') {
            const type = document.getElementById('tx-type').value;
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            
            if(type === 'fuel' && (!gal || !odo)) throw new Error('Kurui reikia Litrų ir Ridos');
            
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift?.id || null,
                vehicle_id: state.activeShift?.vehicle_id || null,
                type: type,
                amount: amt,
                gallons: gal ? parseFloat(gal) : null,
                odometer: odo ? parseInt(odo) : null
            });
            showToast('Išlaida įrašyta', 'success');
        } else {
            showToast('Pajamos vedamos uždarant pamainą', 'info');
            state.loading = false;
            return; 
        }
        closeModals(); 
        
        // SVARBU: Siunčiame signalą
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function exportAI() {
    vibrate();
    state.loading = true;
    try {
        const { data: report } = await db.rpc('get_empire_report', { target_user_id: state.user.id });
        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        showToast('Nukopijuota į Clipboard!', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function refreshAudit() {
    const { data: shifts } = await db.from('finance_shifts')
        .select('end_time, gross_earnings, vehicle_id')
        .eq('status', 'completed')
        .order('end_time', {ascending: false})
        .limit(5);

    const { data: expenses } = await db.from('expenses')
        .select('created_at, amount, type')
        .order('created_at', {ascending: false})
        .limit(5);

    let history = [];
    if (shifts) shifts.forEach(s => history.push({ date: new Date(s.end_time), amount: s.gross_earnings, type: 'SHIFT', is_income: true }));
    if (expenses) expenses.forEach(e => history.push({ date: new Date(e.created_at), amount: e.amount, type: e.type.toUpperCase(), is_income: false }));

    history.sort((a, b) => b.date - a.date);
    history = history.slice(0, 50);

    const el = document.getElementById('audit-list');
    if(!el) return;
    
    if(history.length > 0) {
        el.innerHTML = history.map(item => {
            return `
            <div class="bento-card flex-row justify-between items-center p-3 mb-2 animate-slideUp">
                <div>
                    <p class="text-[9px] text-gray-500 font-bold uppercase">${item.date.toLocaleDateString()} ${item.date.getHours()}:${String(item.date.getMinutes()).padStart(2, '0')}</p>
                    <p class="font-bold text-xs font-bold uppercase">${item.type}</p>
                </div>
                <p class="font-mono font-bold ${item.is_income ? 'text-green-500' : 'text-red-500'}">
                    ${item.is_income ? '+' : '-'}$${item.amount}
                </p>
            </div>`;
        }).join('');
    } else {
        el.innerHTML = '<div class="text-center py-4 opacity-50 text-xs">NO HISTORY</div>';
    }
}
