// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v1.7.2 (FIXED)
// Transactions & History Management
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let currentTxType = null;
let idsToDelete = [];

// ────────────────────────────────────────────────────────────────
// MODAL INITIALIZATION
// ────────────────────────────────────────────────────────────────

export function initFinanceModals() {
    // Prevent duplicate injection
    if (document.getElementById('tx-modal')) return;

    console.log('💰 Finance modals injected');
    
    const container = document.getElementById('modals-container');
    if (!container) return;
    
    container.innerHTML += `
        <div id="tx-modal" class="modal-overlay hidden">
            <div class="modal-card max-w-sm">
                <div class="modal-header">
                    <h3 id="tx-title" class="font-black text-lg">PAJAMOS</h3>
                    <button onclick="closeModals()" class="text-xl opacity-50">&times;</button>
                </div>
                
                <div class="modal-body">
                    <input type="number" 
                           id="tx-amount" 
                           placeholder="0.00" 
                           class="input-field text-3xl font-bold text-center" 
                           step="0.01" 
                           min="0" 
                           inputmode="decimal">
                    
                    <div id="income-types" class="grid grid-cols-3 gap-2 mt-4">
                        <button onclick="setExpType('tips', this)" class="inc-btn active">
                            Tips
                        </button>
                        <button onclick="setExpType('bonus', this)" class="inc-btn">
                            Bonus
                        </button>
                        <button onclick="setExpType('other', this)" class="inc-btn">
                            Kitas
                        </button>
                    </div>
                    
                    <div id="expense-types" class="grid grid-cols-3 gap-2 mt-4 hidden">
                        <button onclick="setExpType('fuel', this)" class="exp-btn">
                            Degalai
                        </button>
                        <button onclick="setExpType('repair', this)" class="exp-btn">
                            Remontas
                        </button>
                        <button onclick="setExpType('toll', this)" class="exp-btn">
                            Keliai
                        </button>
                    </div>
                    
                    <div id="fuel-fields" class="mt-4 hidden space-y-2">
                        <input type="number" 
                               id="tx-gal" 
                               placeholder="Galonai" 
                               class="input-field text-sm" 
                               step="0.1">
                        <input type="number" 
                               id="tx-odo" 
                               placeholder="Odometras" 
                               class="input-field text-sm">
                    </div>
                    
                    <input type="hidden" id="tx-type" value="tips">
                </div>
                
                <div class="modal-footer">
                    <button onclick="confirmTx()" class="btn-primary-os w-full">
                        IŠSAUGOTI
                    </button>
                </div>
            </div>
        </div>
        
        <div id="delete-modal" class="modal-overlay hidden">
            <div class="modal-card max-w-sm">
                <div class="modal-header">
                    <h3 class="font-black text-lg text-red-500">IŠTRINTI ĮRAŠUS</h3>
                    <button onclick="closeModals()" class="text-xl opacity-50">&times;</button>
                </div>
                
                <div class="modal-body text-center">
                    <div class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 text-2xl">
                        <i class="fa-solid fa-trash"></i>
                    </div>
                    <p class="text-sm opacity-75">
                        Ar tikrai norite ištrinti 
                        <span id="del-modal-count" class="font-bold">0</span> 
                        įrašus?
                    </p>
                    <p class="text-xs opacity-50 mt-2">Šio veiksmo atšaukti negalima</p>
                </div>
                
                <div class="modal-footer grid grid-cols-2 gap-3">
                    <button onclick="closeModals()" class="btn-secondary">
                        ATŠAUKTI
                    </button>
                    <button onclick="confirmDelete()" 
                            class="btn-primary-os bg-red-500 text-white border-red-500">
                        IŠTRINTI
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// TRANSACTION MODAL LOGIC
// ────────────────────────────────────────────────────────────────

export function openTxModal(type) {
    vibrate();
    currentTxType = type;
    
    // UI Update
    const title = document.getElementById('tx-title');
    const incomeTypes = document.getElementById('income-types');
    const expenseTypes = document.getElementById('expense-types');
    const fuelFields = document.getElementById('fuel-fields');
    
    if (title) title.textContent = type === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';
    
    if (incomeTypes) incomeTypes.classList.toggle('hidden', type !== 'in');
    if (expenseTypes) expenseTypes.classList.toggle('hidden', type === 'in');
    if (fuelFields) fuelFields.classList.add('hidden'); // Reset fuel

    // Reset inputs
    const amountInput = document.getElementById('tx-amount');
    if (amountInput) amountInput.value = '';
    
    const typeInput = document.getElementById('tx-type');
    if (typeInput) typeInput.value = 'tips'; // Default

    // Reset visuals
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Use window.openModal if available (from ui.js)
    if (window.openModal) {
        window.openModal('tx-modal');
    } else {
        document.getElementById('tx-modal').classList.remove('hidden');
    }
}

export function setExpType(type, el) {
    vibrate();
    const input = document.getElementById('tx-type');
    if (input) input.value = type;
    
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (el) el.classList.add('active');

    const fuelFields = document.getElementById('fuel-fields');
    if (fuelFields) {
        if (type === 'fuel') {
            fuelFields.classList.remove('hidden');
        } else {
            fuelFields.classList.add('hidden');
        }
    }
}

// ────────────────────────────────────────────────────────────────
// SAVE TRANSACTION
// ────────────────────────────────────────────────────────────────

export async function confirmTx() {
    vibrate([20]);
    const amountEl = document.getElementById('tx-amount');
    const amount = parseFloat(amountEl?.value);
    const category = document.getElementById('tx-type')?.value;

    if (!amount || amount <= 0) {
        return showToast('Įvesk sumą', 'error');
    }
    
    if (!category) {
        return showToast('Pasirink kategoriją', 'error');
    }

    state.loading = true;
    
    try {
        if (currentTxType === 'in') {
            await saveIncome(amount, category);
        } else {
            await saveExpense(amount, category);
        }

        if (window.closeModals) window.closeModals();
        else document.getElementById('tx-modal').classList.add('hidden');

        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (error) {
        console.error('Tx Error:', error);
        showToast(error.message, 'error');
    } finally {
        state.loading = false;
    }
}

async function saveIncome(amount, category) {
    // 1. Įrašome į expenses lentelę (kaip income įrašą)
    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: state.activeShift?.id || null,
        vehicle_id: state.activeShift?.vehicle_id || null,
        type: 'income',
        category: category,
        amount: amount,
        created_at: new Date().toISOString()
    });
    
    if (error) throw error;

    // 2. Jei yra aktyvi pamaina, atnaujiname jos gross_earnings
    if (state.activeShift?.id) {
        const { data: shift } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('id', state.activeShift.id)
            .single();
            
        if (shift) {
            const newTotal = (shift.gross_earnings || 0) + amount;
            await db.from('finance_shifts')
                .update({ gross_earnings: newTotal })
                .eq('id', state.activeShift.id);
        }
    }
    
    showToast(`+$${amount.toFixed(2)}`, 'success');
}

async function saveExpense(amount, category) {
    // PATAISYMAS: Leisti expenses ir be aktyvios pamainos (pvz. remontas)
    // Bet kol kas paliekame reikalavimą, nebent nori pakeisti.
    if (!state.activeShift) {
        throw new Error('Išlaidoms reikia pradėti pamainą');
    }
    
    const expenseData = {
        user_id: state.user.id,
        shift_id: state.activeShift.id,
        vehicle_id: state.activeShift.vehicle_id,
        type: 'expense',
        category: category,
        amount: amount,
        created_at: new Date().toISOString()
    };
    
    if (category === 'fuel') {
        const gal = document.getElementById('tx-gal')?.value;
        const odo = document.getElementById('tx-odo')?.value;
        
        if (gal) expenseData.gallons = parseFloat(gal);
        if (odo) expenseData.odometer = parseInt(odo);
    }
    
    const { error } = await db.from('expenses').insert(expenseData);
    if (error) throw error;
    
    showToast(`-$${amount.toFixed(2)}`, 'info');
}

// ────────────────────────────────────────────────────────────────
// HISTORY & DELETION
// ────────────────────────────────────────────────────────────────

export async function refreshAudit() {
    try {
        const { data: shifts, error } = await db
            .from('finance_shifts')
            .select('*')
            .eq('user_id', state.user.id)
            .order('start_time', { ascending: false })
            .limit(50);
            
        if (error) throw error;
        
        const listEl = document.getElementById('audit-list');
        if (!listEl) return;
        
        // Reset checkbox
        const masterBox = document.getElementById('select-all-logs');
        if (masterBox) masterBox.checked = false;
        
        // Use window function if available
        if (window.updateDeleteButton) window.updateDeleteButton(); 

        if (!shifts || shifts.length === 0) {
            listEl.innerHTML = '<div class="text-center py-10 opacity-50 text-sm">Nėra istorijos</div>';
            return;
        }

        listEl.innerHTML = shifts.map(shift => {
            const start = new Date(shift.start_time);
            const dateStr = start.toLocaleDateString('lt-LT', { 
                month: '2-digit', 
                day: '2-digit' 
            });
            
            const timeStr = start.toLocaleTimeString('lt-LT', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            const earn = shift.gross_earnings || 0;
            const statusColor = shift.status === 'completed' 
                ? 'text-gray-400' 
                : 'text-teal-500 animate-pulse';
            
            return `
            <div class="log-card group relative bg-white dark:bg-[#111] rounded-xl p-4 border border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <input type="checkbox" 
                           value="${shift.id}" 
                           onchange="updateDeleteButton()" 
                           class="log-checkbox w-5 h-5 rounded border-gray-600 bg-gray-800 text-teal-500 accent-teal-500">
                    <div>
                        <div class="text-xs font-bold text-gray-500">${dateStr}</div>
                        <div class="text-sm font-bold ${statusColor}">${timeStr}</div>
                    </div>
                </div>
                <div class="font-mono font-bold text-green-500">+$${earn}</div>
            </div>`;
        }).join('');
        
    } catch (e) {
        console.error(e);
    }
}

// ────────────────────────────────────────────────────────────────
// GLOBAL FUNCTIONS FOR HTML INTERACTION (Window Exports)
// ────────────────────────────────────────────────────────────────

// Helper helpers
function getCheckedIds() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    return Array.from(checked).map(c => c.value);
}

// Main Window Exports
window.openTxModal = openTxModal;
window.setExpType = setExpType;
window.confirmTx = confirmTx;
window.refreshAudit = refreshAudit;

window.toggleSelectAll = function() {
    vibrate();
    const master = document.getElementById('select-all-logs');
    const boxes = document.querySelectorAll('.log-checkbox');
    boxes.forEach(b => b.checked = master.checked);
    window.updateDeleteButton();
};

window.updateDeleteButton = function() {
    const ids = getCheckedIds();
    const btn = document.getElementById('btn-delete-logs');
    const count = document.getElementById('delete-count');
    
    if (btn && count) {
        count.textContent = ids.length;
        if (ids.length > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
};

window.requestDelete = function() {
    vibrate();
    idsToDelete = getCheckedIds();
    
    if (idsToDelete.length === 0) return;
    
    const countEl = document.getElementById('del-modal-count');
    if (countEl) countEl.textContent = idsToDelete.length;
    
    if (window.openModal) window.openModal('delete-modal');
    else document.getElementById('delete-modal').classList.remove('hidden');
};

window.confirmDelete = async function() {
    vibrate([20]);
    if (idsToDelete.length === 0) return;
    
    state.loading = true;
    try {
        await db.from('expenses').delete().in('shift_id', idsToDelete);
        const { error } = await db.from('finance_shifts').delete().in('id', idsToDelete);
        
        if (error) throw error;
        
        showToast(`${idsToDelete.length} įrašai ištrinti`, 'success');
        
        if(window.closeModals) window.closeModals();
        idsToDelete = [];
        
        refreshAudit();
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (error) {
        showToast('Klaida trinant', 'error');
        console.error(error);
    } finally {
        state.loading = false;
    }
};
