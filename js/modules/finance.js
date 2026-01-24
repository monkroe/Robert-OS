// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v2.1 (LOGS UI FIX)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let currentTxType = null;
let idsToDelete = [];

// ────────────────────────────────────────────────────────────────
// TRANSACTION LOGIC
// ────────────────────────────────────────────────────────────────

export function openTxModal(type) {
    vibrate();
    currentTxType = type;
    const modal = document.getElementById('tx-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    const title = document.getElementById('tx-title');
    const amountInput = document.getElementById('tx-amount');
    const incomeTypes = document.getElementById('income-types');
    const expenseTypes = document.getElementById('expense-types');
    const fuelFields = document.getElementById('fuel-fields');

    title.textContent = type === 'in' ? 'PAJAMOS' : 'IŠLAIDOS';
    
    if (incomeTypes) incomeTypes.classList.toggle('hidden', type !== 'in');
    if (expenseTypes) expenseTypes.classList.toggle('hidden', type === 'in');
    if (fuelFields) fuelFields.classList.add('hidden');

    amountInput.value = '';
    document.getElementById('tx-type').value = 'tips'; // Default

    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => btn.classList.remove('active'));
}

export function setExpType(type, el) {
    vibrate();
    document.getElementById('tx-type').value = type;
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');

    const fuelFields = document.getElementById('fuel-fields');
    if (fuelFields) fuelFields.classList.toggle('hidden', type !== 'fuel');
}

export async function confirmTx() {
    vibrate([20]);
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const category = document.getElementById('tx-type').value;

    if (!amount || amount <= 0) return showToast('Įvesk sumą', 'error');
    if (!category) return showToast('Pasirink kategoriją', 'error');

    try {
        if (currentTxType === 'in') await saveIncome(amount, category);
        else await saveExpense(amount, category);

        window.closeModals(); // Naudojame globalią UI funkciją
        window.dispatchEvent(new Event('refresh-data'));
    } catch (error) {
        console.error('Tx Error:', error);
        showToast(error.message, 'error');
    }
}

async function saveIncome(amount, category) {
    const shiftId = state.activeShift?.id || null;
    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: shiftId,
        vehicle_id: state.activeShift?.vehicle_id || null,
        type: 'income',
        category, amount, created_at: new Date().toISOString()
    });
    if (error) throw error;

    if (shiftId) {
        // Atnaujiname pamainos bendrą uždarbį (cache)
        const { data: shift } = await db.from('finance_shifts').select('gross_earnings').eq('id', shiftId).single();
        if (shift) {
            await db.from('finance_shifts').update({ gross_earnings: (shift.gross_earnings || 0) + amount }).eq('id', shiftId);
        }
    }
    showToast(`+$${amount.toFixed(2)}`, 'success');
}

async function saveExpense(amount, category) {
    if (!state.activeShift) return showToast('Pradėk pamainą!', 'error');
    
    const expenseData = {
        user_id: state.user.id,
        shift_id: state.activeShift.id,
        vehicle_id: state.activeShift.vehicle_id,
        type: 'expense',
        category, amount, created_at: new Date().toISOString()
    };
    
    if (category === 'fuel') {
        const gal = document.getElementById('tx-gal').value;
        const odo = document.getElementById('tx-odo').value;
        if(gal) expenseData.gallons = parseFloat(gal);
        if(odo) expenseData.odometer = parseInt(odo);
    }
    
    const { error } = await db.from('expenses').insert(expenseData);
    if (error) throw error;
    showToast(`-$${amount.toFixed(2)}`, 'info');
}

// ────────────────────────────────────────────────────────────────
// AUDIT / LOGS (PATAISYTA VERSIJA)
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
        const selectAllBox = document.getElementById('select-all-logs');
        if (selectAllBox) selectAllBox.checked = false;
        
        window.updateDeleteButton();
        
        if (!shifts || shifts.length === 0) {
            listEl.innerHTML = '<div class="text-center py-10 opacity-50 text-sm">Nėra istorijos</div>';
            return;
        }
        
        listEl.innerHTML = shifts.map(shift => {
            const start = new Date(shift.start_time);
            const dateStr = start.toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit' });
            const startTimeStr = start.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
            
            let endTimeStr = '...';
            let durationStr = 'Active';
            let statusBadge = '';
            
            if (shift.end_time) {
                const end = new Date(shift.end_time);
                endTimeStr = end.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
                
                const diffMs = end - start;
                const hours = Math.floor(diffMs / 3600000);
                const mins = Math.floor((diffMs % 3600000) / 60000);
                durationStr = `${hours}h ${mins}m`;
                
                statusBadge = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 uppercase">DONE</span>`;
            } else {
                statusBadge = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-500 uppercase animate-pulse">ACTIVE</span>`;
            }
            
            const earnings = shift.gross_earnings || 0;
            
            // FIX: Naudojama .log-card klasė CSS taisyklėms
            return `
                <div class="log-card group relative bg-white rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between transition-all">
                    <div class="flex items-center gap-4">
                        <input type="checkbox" 
                               value="${shift.id}" 
                               onchange="window.updateDeleteButton()" 
                               class="log-checkbox w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-500 cursor-pointer">
                        
                        <div class="flex flex-col">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs font-bold text-gray-400">${dateStr}</span>
                                ${statusBadge}
                            </div>
                            <div class="text-sm font-bold tracking-tight text-gray-900 dark:text-white">
                                ${startTimeStr} - ${endTimeStr} <span class="text-xs text-gray-400 font-normal ml-1">(${durationStr})</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <span class="text-lg font-bold text-green-600 dark:text-green-400">+$${earnings}</span>
                        <button class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-500 hover:text-teal-500 transition-colors">
                            <i class="fa-solid fa-pen text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Audit Error:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// DELETE LOGIC (WINDOW FUNCTIONS)
// ────────────────────────────────────────────────────────────────

window.toggleSelectAll = function() {
    vibrate();
    const master = document.getElementById('select-all-logs');
    const checkboxes = document.querySelectorAll('.log-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
    window.updateDeleteButton();
};

window.updateDeleteButton = function() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    const countSpan = document.getElementById('delete-count');
    const master = document.getElementById('select-all-logs');

    if (checked.length > 0) {
        btn.classList.remove('hidden');
        countSpan.textContent = checked.length;
    } else {
        btn.classList.add('hidden');
    }
    
    if(master) {
         const all = document.querySelectorAll('.log-checkbox');
         master.checked = (checked.length === all.length && all.length > 0);
    }
};

window.requestDelete = function() {
    vibrate();
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    if (checkboxes.length === 0) return;
    
    idsToDelete = Array.from(checkboxes).map(cb => cb.value);
    
    const countEl = document.getElementById('del-modal-count');
    if(countEl) countEl.textContent = idsToDelete.length;
    
    window.openModal('delete-modal');
};

window.confirmDelete = async function() {
    vibrate([20]);
    if (idsToDelete.length === 0) return;
    
    try {
        // Cascade delete: Pirmiausia išlaidos, tada pamainos
        await db.from('expenses').delete().in('shift_id', idsToDelete);
        const { error } = await db.from('finance_shifts').delete().in('id', idsToDelete);
        
        if (error) throw error;
        
        showToast(`${idsToDelete.length} logs deleted`, 'success');
        window.closeModals();
        idsToDelete = [];
        refreshAudit();
        window.dispatchEvent(new Event('refresh-data')); // Atnaujina ir dashboard statistiką
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast(error.message, 'error');
    }
};

// ────────────────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────────────────

export async function exportAI() {
    vibrate();
    showToast('AI Export - Coming Soon', 'info');
}
