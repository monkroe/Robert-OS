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
    if (event) event.target.classList.add('bg-teal-500', 'text-black');
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
            await db.from('expenses').insert({
                type: type,
                amount: amt,
                gallons: gal ? parseFloat(gal) : null,
                odometer: odo ? parseInt(odo) : null
            });
            showToast('Išlaida įrašyta', 'success');
        } else {
            // Įmesti pajamas į aktyvią pamainą, jei ji vyksta
            if (state.activeShift) {
                const isCash = confirm("Ar tai grynieji / Tips? (OK = Taip, Cancel = Uber/App)");
                const field = isCash ? 'income_cash' : 'income_app';
                const currentVal = state.activeShift[field] || 0;
                
                await db.from('finance_shifts')
                    .update({ [field]: currentVal + amt })
                    .eq('id', state.activeShift.id);
                showToast('Pajamos pridėtos prie pamainos!', 'success');
            } else {
                showToast('Pajamos vedamos tik pamainos metu', 'error');
            }
        }
        closeModals(); 
        window.dispatchEvent(new Event('refresh-data'));
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

export async function refreshAudit() {
    // Gauname pamainas su visais naujais laukais
    const { data: shifts } = await db.from('finance_shifts')
        .select('*, vehicles(name)')
        .eq('status', 'completed')
        .order('end_time', {ascending: false})
        .limit(20);

    const { data: expenses } = await db.from('expenses')
        .select('*')
        .order('created_at', {ascending: false})
        .limit(20);

    let history = [];
    if (shifts) shifts.forEach(s => {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const diff = Math.floor((end - start) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);

        history.push({ 
            id: s.id, 
            table: 'finance_shifts', 
            date: end, 
            amount: s.gross_earnings, 
            type: 'PAMAINA', 
            is_income: true,
            details: {
                interval: `${start.getHours()}:${String(start.getMinutes()).padStart(2,'0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2,'0')}`,
                duration: `${h}h ${m}m`,
                car: s.vehicles?.name || 'Nenurodyta',
                app: s.income_app || 0,
                private: s.income_private || 0,
                cash: s.income_cash || 0,
                weather: s.weather || 'sunny'
            }
        });
    });
    
    if (expenses) expenses.forEach(e => history.push({ 
        id: e.id, 
        table: 'expenses', 
        date: new Date(e.created_at), 
        amount: e.amount, 
        type: e.type.toUpperCase(), 
        is_income: false 
    }));

    history.sort((a, b) => b.date - a.date);
    currentHistory = history;

    const el = document.getElementById('audit-list');
    if(!el) return;

    el.innerHTML = history.map(item => {
        if (item.table === 'finance_shifts') {
            return `
            <div class="bento-card p-0 overflow-hidden border-white/5 mb-2">
                <button onclick="this.nextElementSibling.classList.toggle('hidden'); vibrate();" class="w-full text-left p-4 flex items-center justify-between active:bg-white/5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-500">
                            <i class="fa-solid fa-car-side"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold uppercase tracking-tight text-white">${item.type}</p>
                            <p class="text-[10px] text-gray-500">${item.date.toLocaleDateString()} • ${item.details.interval}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-green-500">+$${item.amount}</p>
                        <i class="fa-solid fa-chevron-down text-[10px] opacity-20"></i>
                    </div>
                </button>
                <div class="hidden bg-white/[0.02] border-t border-white/5 p-4 space-y-3 animate-slideUp">
                    <div class="grid grid-cols-2 gap-4">
                        <div><span class="label-xs block">Trukmė</span><p class="text-sm font-mono text-white">${item.details.duration}</p></div>
                        <div><span class="label-xs block">Auto</span><p class="text-sm text-white">${item.details.car}</p></div>
                    </div>
                    <div class="border-t border-white/5 pt-2 space-y-1">
                        <div class="flex justify-between text-[11px]"><span class="text-gray-400">Uber / App:</span><span class="text-white">$${item.details.app}</span></div>
                        <div class="flex justify-between text-[11px]"><span class="text-gray-400">Privatūs:</span><span class="text-white">$${item.details.private}</span></div>
                        <div class="flex justify-between text-[11px]"><span class="text-gray-400">Cash Tips:</span><span class="text-white">$${item.details.cash}</span></div>
                    </div>
                </div>
            </div>`;
        } else {
            return `
            <div class="bento-card flex-row items-center p-4 gap-3 border-white/5 mb-2">
                <div class="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                    <i class="fa-solid fa-tag"></i>
                </div>
                <div class="flex-1">
                    <p class="text-[10px] text-gray-500 uppercase font-bold">${item.date.toLocaleDateString()}</p>
                    <p class="text-xs font-bold uppercase text-white">${item.type}</p>
                </div>
                <p class="font-bold text-red-400">-$${item.amount}</p>
            </div>`;
        }
    }).join('');
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
