import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';

// --- 1. NAUJA IŠLAIDŲ / PAJAMŲ ĮVEDIMO LOGIKA (Paliekame seną, nes ji veikia) ---

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
                type: type,
                amount: amt,
                gallons: gal ? parseFloat(gal) : null,
                odometer: odo ? parseInt(odo) : null,
                // user_id bus įrašytas automatiškai DB
            });
            showToast('Išlaida įrašyta', 'success');
        } else {
            showToast('Pajamos vedamos uždarant pamainą', 'info');
            state.loading = false;
            return; 
        }
        closeModals(); 
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


// --- 2. NAUJA ISTORIJOS VALDYMO LOGIKA (Admin Mode) ---

let currentHistory = []; // Čia saugosime duomenis, kad galėtume redaguoti

export async function refreshAudit() {
    // 1. Gauname daugiau duomenų (50)
    const { data: shifts } = await db.from('finance_shifts')
        .select('id, end_time, gross_earnings, status')
        .eq('status', 'completed')
        .order('end_time', {ascending: false})
        .limit(50);

    const { data: expenses } = await db.from('expenses')
        .select('id, created_at, amount, type')
        .order('created_at', {ascending: false})
        .limit(50);

    // 2. Sujungiame į vieną sąrašą
    let history = [];
    if (shifts) shifts.forEach(s => history.push({ 
        id: s.id, 
        table: 'finance_shifts', 
        date: new Date(s.end_time), 
        amount: s.gross_earnings, 
        type: 'SHIFT', 
        is_income: true 
    }));
    
    if (expenses) expenses.forEach(e => history.push({ 
        id: e.id, 
        table: 'expenses', 
        date: new Date(e.created_at), 
        amount: e.amount, 
        type: e.type.toUpperCase(), 
        is_income: false 
    }));

    history.sort((a, b) => b.date - a.date);
    currentHistory = history; // Išsaugome atmintyje

    // 3. Piešiame sąrašą su Checkboxais ir Edit mygtukais
    const el = document.getElementById('audit-list');
    if(!el) return;

    // Įdedame Valdymo juostą (Select All | Delete)
    let html = `
    <div class="flex justify-between items-center mb-3 px-1">
        <label class="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer">
            <input type="checkbox" id="hist-select-all" class="w-4 h-4 rounded bg-gray-700 border-gray-600">
            SELECT ALL
        </label>
        <button id="hist-delete-btn" class="hidden bg-red-500/20 text-red-500 px-3 py-1 rounded text-xs font-bold border border-red-500/50 hover:bg-red-500 hover:text-white transition">
            TRINTI (<span id="hist-sel-count">0</span>)
        </button>
    </div>
    <div class="space-y-2">
    `;

    if(history.length > 0) {
        html += history.map(item => `
            <div class="bento-card flex flex-row items-center p-3 gap-3 animate-slideUp group">
                <input type="checkbox" 
                    class="hist-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 focus:ring-teal-500 text-teal-500" 
                    data-id="${item.id}" 
                    data-table="${item.table}">
                
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline">
                        <p class="text-[10px] text-gray-500 font-bold uppercase">
                            ${item.date.toLocaleDateString()} ${item.date.getHours()}:${String(item.date.getMinutes()).padStart(2, '0')}
                        </p>
                        <p class="text-[10px] text-gray-600 font-mono">${item.table === 'finance_shifts' ? 'PAMAIN' : 'IŠLAID'}</p>
                    </div>
                    <div class="flex justify-between items-center mt-0.5">
                        <p class="font-bold text-xs uppercase tracking-wide truncate pr-2">${item.type}</p>
                        <p class="font-mono font-bold ${item.is_income ? 'text-green-500' : 'text-red-400'}">
                            ${item.is_income ? '+' : '-'}$${item.amount}
                        </p>
                    </div>
                </div>

                <button onclick="window.editItem('${item.id}')" class="p-2 text-gray-600 hover:text-teal-400 active:scale-95 transition">
                    ✏️
                </button>
            </div>
        `).join('');
    } else {
        html += '<div class="text-center py-6 opacity-40 text-xs">ISTORIJA TUŠČIA</div>';
    }
    
    html += '</div>'; // Uždaryti space-y-2
    el.innerHTML = html;

    // 4. Pridedame Event Listeners (Mygtukų logika)
    setupHistoryEvents();
}

function setupHistoryEvents() {
    const selectAll = document.getElementById('hist-select-all');
    const deleteBtn = document.getElementById('hist-delete-btn');
    const countSpan = document.getElementById('hist-sel-count');
    const checkboxes = document.querySelectorAll('.hist-checkbox');

    // Select All funkcija
    if(selectAll) {
        selectAll.addEventListener('change', (e) => {
            vibrate();
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateDeleteBtn();
        });
    }

    // Pavienių checkboxų funkcija
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            vibrate();
            updateDeleteBtn();
            // Jei atžymėjom bent vieną, nuimam Select All varnelę
            if(!cb.checked && selectAll) selectAll.checked = false;
        });
    });

    // Trinti mygtukas
    if(deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            vibrate([30]);
            const selected = Array.from(document.querySelectorAll('.hist-checkbox:checked')).map(cb => ({
                id: cb.dataset.id,
                table: cb.dataset.table
            }));

            if(!confirm(`Ar tikrai ištrinti ${selected.length} įrašus?`)) return;

            state.loading = true;
            try {
                // Rūšiuojame pagal lenteles
                const shiftsToDelete = selected.filter(i => i.table === 'finance_shifts').map(i => i.id);
                const expensesToDelete = selected.filter(i => i.table === 'expenses').map(i => i.id);

                if(shiftsToDelete.length > 0) await db.from('finance_shifts').delete().in('id', shiftsToDelete);
                if(expensesToDelete.length > 0) await db.from('expenses').delete().in('id', expensesToDelete);

                showToast('Ištrinta sėkmingai 🗑️', 'success');
                window.dispatchEvent(new Event('refresh-data')); // Perkraunam viską
            } catch(e) {
                showToast('Klaida trinant', 'error');
                console.error(e);
            } finally {
                state.loading = false;
            }
        });
    }

    function updateDeleteBtn() {
        const count = document.querySelectorAll('.hist-checkbox:checked').length;
        if(count > 0) {
            deleteBtn.classList.remove('hidden');
            countSpan.textContent = count;
        } else {
            deleteBtn.classList.add('hidden');
        }
    }
}

// --- 3. REDAGAVIMO LOGIKA (Inject Modal) ---
// Kad nereikėtų keisti HTML, sukuriame redagavimo langą dinamiškai

window.editItem = async (id) => {
    vibrate();
    const item = currentHistory.find(i => i.id === id);
    if(!item) return;

    // Sukuriame laikiną modalą, jei nėra
    if(!document.getElementById('edit-modal-dynamic')) {
        const modalHtml = `
        <div id="edit-modal-dynamic" class="fixed inset-0 z-[60] bg-black/90 hidden flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-zinc-900 border border-zinc-800 w-full max-w-sm p-6 rounded-2xl shadow-2xl animate-scaleIn">
                <h3 class="text-xl font-bold text-white mb-1">Redaguoti</h3>
                <p id="edit-subtitle" class="text-xs text-gray-500 mb-4 uppercase">...</p>
                
                <label class="block text-xs text-gray-400 mb-1 ml-1">Suma ($)</label>
                <input type="number" id="edit-amount" class="w-full bg-black border border-zinc-700 rounded-xl p-4 text-2xl font-mono text-white focus:border-teal-500 focus:outline-none mb-6">
                
                <div class="grid grid-cols-2 gap-3">
                    <button id="edit-cancel" class="p-4 rounded-xl font-bold bg-zinc-800 text-gray-300 hover:bg-zinc-700">Atšaukti</button>
                    <button id="edit-save" class="p-4 rounded-xl font-bold bg-teal-500 text-black hover:bg-teal-400">Išsaugoti</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const modal = document.getElementById('edit-modal-dynamic');
    const input = document.getElementById('edit-amount');
    const subtitle = document.getElementById('edit-subtitle');
    const saveBtn = document.getElementById('edit-save');
    const cancelBtn = document.getElementById('edit-cancel');

    // Užpildome duomenis
    subtitle.textContent = `${item.type} (${item.date.toLocaleDateString()})`;
    input.value = item.amount;
    modal.classList.remove('hidden');

    // Mygtukų veiksmai
    const close = () => modal.classList.add('hidden');
    
    // Panaikinam senus event listenerius (klonavimo triukas)
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newCancel.addEventListener('click', () => { vibrate(); close(); });
    
    newSave.addEventListener('click', async () => {
        vibrate();
        const newAmount = parseFloat(input.value);
        if(isNaN(newAmount)) return showToast('Įvesk skaičių', 'error');

        state.loading = true;
        close(); // Uždarom iškart, kad neatrodytų užstrigę

        try {
            let updateData = {};
            // Skirtingi stulpeliai skirtingoms lentelėms
            if (item.table === 'finance_shifts') {
                updateData = { gross_earnings: newAmount };
            } else {
                updateData = { amount: newAmount };
            }

            const { error } = await db.from(item.table).update(updateData).eq('id', item.id);
            if(error) throw error;

            showToast('Atnaujinta! ✅', 'success');
            window.dispatchEvent(new Event('refresh-data'));
        } catch(e) {
            showToast('Klaida saugant', 'error');
            console.error(e);
        } finally {
            state.loading = false;
        }
    });
};
