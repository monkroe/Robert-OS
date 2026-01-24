// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v1.4.1 (PATCH: DARK MODE & MODALS)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let currentTxType = null;
let idsToDelete = []; // Laikinas kintamasis trynimui

// ────────────────────────────────────────────────────────────────
// TRANSACTION MODAL (Standard)
// ────────────────────────────────────────────────────────────────

export function openTxModal(type) {
    vibrate();
    currentTxType = type;
    
    const modal = document.getElementById('tx-modal');
    const title = document.getElementById('tx-title');
    const amountInput = document.getElementById('tx-amount');
    const expenseTypes = document.getElementById('expense-types');
    const incomeTypes = document.getElementById('income-types');
    const fuelFields = document.getElementById('fuel-fields');
    
    if (!modal || !title || !amountInput) return;
    
    if (type === 'in') {
        title.textContent = 'PAJAMOS';
        if (expenseTypes) expenseTypes.classList.add('hidden');
        if (incomeTypes) incomeTypes.classList.remove('hidden');
        if (fuelFields) fuelFields.classList.add('hidden');
    } else {
        title.textContent = 'IŠLAIDOS';
        if (expenseTypes) expenseTypes.classList.remove('hidden');
        if (incomeTypes) incomeTypes.classList.add('hidden');
        if (fuelFields) fuelFields.classList.add('hidden');
    }
    
    amountInput.value = '';
    document.getElementById('tx-type').value = 'tips';
    
    // Reset buttons
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => {
        btn.classList.remove('bg-teal-500', 'text-black', 'border-teal-500');
    });
    
    modal.classList.remove('hidden');
}

export function setExpType(type, el) {
    vibrate();
    document.getElementById('tx-type').value = type;
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    
    const fuelFields = document.getElementById('fuel-fields');
    if (fuelFields) {
        fuelFields.classList.toggle('hidden', type !== 'fuel');
    }
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
        
        closeModals();
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
        expenseData.gallons = parseFloat(document.getElementById('tx-gal').value);
        expenseData.odometer = parseInt(document.getElementById('tx-odo').value);
    }
    const { error } = await db.from('expenses').insert(expenseData);
    if (error) throw error;
    showToast(`-$${amount.toFixed(2)}`, 'info');
}

// ────────────────────────────────────────────────────────────────
// AUDIT (ISTORIJA) - DARK MODE FIXED + SELECT ALL
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
        
        updateDeleteButton(); // Reset UI
        
        if (!shifts || shifts.length === 0) {
            listEl.innerHTML = '<div class="text-center py-10 opacity-50 text-sm">Nėra istorijos</div>';
            return;
        }
        
        listEl.innerHTML = shifts.map(shift => {
            const date = new Date(shift.start_time);
            const dateStr = date.toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit' });
            const timeStr = date.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
            const earnings = shift.gross_earnings || 0;
            const type = shift.status === 'completed' ? 'SHIFT' : 'ACTIVE';
            
            // DARK MODE FIX: Naudojame labai specifines spalvas
            // Light: bg-white, text-gray-900
            // Dark: bg-[#111111] (beveik juoda), text-white, border-white/10
            return `
                <div class="group relative bg-white dark:bg-[#111111] rounded-xl p-4 border border-gray-200 dark:border-white/10 shadow-sm flex items-center justify-between transition-colors">
                    <div class="flex items-center gap-4">
                        <input type="checkbox" 
                               value="${shift.id}" 
                               onchange="window.updateDeleteButton()" 
                               class="log-checkbox w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-500 bg-gray-100 dark:bg-gray-800 dark:border-gray-600 cursor-pointer">
                        
                        <div>
                            <p class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
                                ${date.getFullYear()}-${dateStr} • ${timeStr}
                            </p>
                            <p class="font-black text-gray-900 dark:text-white text-lg tracking-tight">${type}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <span class="text-lg font-bold text-green-600 dark:text-green-400">+$${earnings}</span>
                        <button class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-400 hover:text-teal-500 transition-colors">
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
// SELECT ALL & DELETE LOGIC (CUSTOM MODAL)
// ────────────────────────────────────────────────────────────────

// 1. SELECT ALL
window.toggleSelectAll = function() {
    vibrate();
    const master = document.getElementById('select-all-logs');
    const checkboxes = document.querySelectorAll('.log-checkbox');
    
    checkboxes.forEach(cb => {
        cb.checked = master.checked;
    });
    
    updateDeleteButton();
};

// 2. UPDATE UI
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

    // Jei atžymėjome vieną ranka, master turi atsžymėti
    const all = document.querySelectorAll('.log-checkbox');
    if (master && all.length > 0) {
        master.checked = (checked.length === all.length);
    }
};

// 3. OPEN CUSTOM MODAL (Request Delete)
window.requestDelete = function() {
    vibrate();
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    if (checkboxes.length === 0) return;
    
    // Išsaugome ID į globalų kintamąjį, kad modalas žinotų ką trinti
    idsToDelete = Array.from(checkboxes).map(cb => cb.value);
    
    // Atnaujiname modal tekstą
    document.getElementById('del-modal-count').textContent = idsToDelete.length;
    
    // Atidarome modalą
    document.getElementById('delete-modal').classList.remove('hidden');
};

// 4. CONFIRM DELETE (Execute)
window.confirmDelete = async function() {
    vibrate([20]);
    
    if (idsToDelete.length === 0) return;
    
    state.loading = true;
    try {
        await db.from('expenses').delete().in('shift_id', idsToDelete);
        const { error } = await db.from('finance_shifts').delete().in('id', idsToDelete);
        
        if (error) throw error;
        
        showToast(`${idsToDelete.length} logs deleted`, 'success');
        
        closeModals();
        idsToDelete = []; // Išvalome
        refreshAudit();   // Perkrauname sąrašą
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast(error.message, 'error');
    } finally {
        state.loading = false;
    }
};

// ────────────────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────────────────

export async function exportAI() {
    vibrate();
    showToast('AI Export - Coming Soon', 'info');
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.classList.add('hidden');
    });
}
