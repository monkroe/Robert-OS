import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';

// --- PAJAMŲ / IŠLAIDŲ LOGIKA ---

export function openTxModal(dir) {
    vibrate();
    state.txDirection = dir; // 'in' (Pajamos) arba 'out' (Išlaidos)
    
    const title = document.getElementById('tx-title');
    const modalContent = document.getElementById('tx-modal-content'); // Reikės šiek tiek pakoreguoti HTML jei norim dinamiškumo, bet kol kas naudojam esamą
    
    document.getElementById('tx-amount').value = '';
    
    if (dir === 'in') {
        title.textContent = 'Pajamos';
        // Rodyti pajamų tipus (App, Private, Cash)
        document.getElementById('expense-types').classList.remove('hidden');
        document.getElementById('fuel-fields').classList.add('hidden');
        
        // Pakeičiam mygtukus į pajamų tipus
        const typeContainer = document.getElementById('expense-types');
        typeContainer.innerHTML = `
            <button type="button" onclick="window.setExpType('income_app')" class="exp-btn flex-1 p-2 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">📱 APP</button>
            <button type="button" onclick="window.setExpType('income_private')" class="exp-btn flex-1 p-2 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">🤝 PRIV</button>
            <button type="button" onclick="window.setExpType('income_cash')" class="exp-btn flex-1 p-2 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">💵 CASH</button>
        `;
        document.getElementById('tx-type').value = 'income_app'; // Default
    } else {
        title.textContent = 'Išlaidos';
        document.getElementById('expense-types').classList.remove('hidden');
        // Grąžinam išlaidų mygtukus
        const typeContainer = document.getElementById('expense-types');
        typeContainer.innerHTML = `
            <button type="button" onclick="window.setExpType('fuel')" class="exp-btn flex-1 p-2 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">⛽ KURO</button>
            <button type="button" onclick="window.setExpType('other')" class="exp-btn flex-1 p-2 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">🛠 KITA</button>
            <button type="button" onclick="window.setExpType('food')" class="exp-btn flex-1 p-2 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">🍔 MAIST</button>
        `;
        document.getElementById('tx-type').value = 'fuel'; // Default
        document.getElementById('fuel-fields').classList.remove('hidden');
    }
    
    document.getElementById('tx-modal').classList.remove('hidden');
}

export function setExpType(type) {
    vibrate();
    document.getElementById('tx-type').value = type;
    
    // Jei tai išlaidos, valdom kuro laukus
    if (state.txDirection === 'out') {
        document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    }
    
    document.querySelectorAll('.exp-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black'));
    event.target.classList.add('bg-teal-500', 'text-black');
}

export async function confirmTx() {
    vibrate([20]);
    const amt = parseFloat(document.getElementById('tx-amount').value);
    const type = document.getElementById('tx-type').value;
    
    if(!amt) return showToast('Įvesk sumą', 'error');
    
    state.loading = true;
    try {
        if(state.txDirection === 'out') {
            // IŠLAIDOS (Senoji logika)
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            if(type === 'fuel' && (!gal || !odo)) throw new Error('Kurui reikia Litrų ir Ridos');
            
            await db.from('expenses').insert({
                type: type,
                amount: amt,
                gallons: gal ? parseFloat(gal) : null,
                odometer: odo ? parseInt(odo) : null
            });
            showToast('Išlaida įrašyta', 'success');
        } else {
            // PAJAMOS (Nauja logika - update active shift)
            if (!state.activeShift) throw new Error('Pajamas galima vesti tik pamainos metu');
            
            // Reikia nuskaityti esamą reikšmę ir pridėti naują (increment)
            // Supabase neturi tiesioginio "increment", todėl darom paprastai:
            // Bet kadangi tai SQL triggeris skaičiuoja gross, mums tereikia atnaujinti atitinkamą stulpelį.
            // Kad būtų saugu, naudosim RPC ateityje, bet dabar tiesiog paimsim iš state.
            
            const currentVal = state.activeShift[type] || 0;
            const newVal = currentVal + amt;
            
            const updateObj = {};
            updateObj[type] = newVal;
            
            await db.from('finance_shifts').update(updateObj).eq('id', state.activeShift.id);
            showToast(`Pajamos pridėtos: +$${amt}`, 'success');
        }
        
        closeModals(); 
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}


// --- LOGBOOK (ISTORIJA) ---

export async function refreshAudit() {
    const { data: shifts } = await db.from('finance_shifts')
        .select('*') // Imam viską
        .eq('status', 'completed')
        .order('end_time', {ascending: false})
        .limit(20);

    const el = document.getElementById('audit-list');
    if(!el) return;

    if(shifts && shifts.length > 0) {
        el.innerHTML = shifts.map(s => {
            const start = new Date(s.start_time);
            const end = new Date(s.end_time);
            
            // Trukmė
            const durationMs = end - start;
            const h = Math.floor(durationMs / 3600000);
            const m = Math.floor((durationMs % 3600000) / 60000);
            
            // Orai
            const weatherIcons = { sunny: '☀️', rain: '🌧️', snow: '❄️', ice: '🧊', fog: '🌫️' };
            const weatherIcon = weatherIcons[s.weather] || '';

            return `
            <div class="bento-card mb-3 p-4 animate-slideUp group cursor-pointer" onclick="this.classList.toggle('expanded')">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] text-gray-500 font-bold uppercase">${start.toLocaleDateString()}</span>
                            <span class="text-xs">${weatherIcon}</span>
                        </div>
                        <p class="font-bold text-sm text-white">
                            ${start.getHours()}:${String(start.getMinutes()).padStart(2,'0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2,'0')}
                            <span class="text-gray-500 font-normal ml-1">(${h}h ${m}m)</span>
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="font-mono font-bold text-teal-400 text-lg">+$${s.gross_earnings}</p>
                        <p class="text-[10px] text-gray-500 uppercase">${s.end_odo - s.start_odo} mylių</p>
                    </div>
                </div>

                <div class="hidden-details mt-4 pt-4 border-t border-zinc-800 hidden group-[.expanded]:block animate-fadeIn">
                    <div class="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                        <div class="bg-zinc-900 p-2 rounded-lg">
                            <span class="block text-gray-500 text-[10px]">APPS</span>
                            <span class="font-mono text-white">$${s.income_app}</span>
                        </div>
                        <div class="bg-zinc-900 p-2 rounded-lg">
                            <span class="block text-gray-500 text-[10px]">PRIV</span>
                            <span class="font-mono text-white">$${s.income_private}</span>
                        </div>
                        <div class="bg-zinc-900 p-2 rounded-lg">
                            <span class="block text-gray-500 text-[10px]">CASH</span>
                            <span class="font-mono text-white">$${s.income_cash}</span>
                        </div>
                    </div>
                    <div class="flex justify-between text-[10px] text-gray-500">
                        <span>Rida: ${s.start_odo} -> ${s.end_odo}</span>
                        <span>ID: ...${s.id.slice(-4)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    } else {
        el.innerHTML = '<div class="text-center py-6 opacity-40 text-xs">Istorija tuščia</div>';
    }
}

// Global functions
window.setExpType = setExpType;
