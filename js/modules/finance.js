// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v1.3 (FIXED VISUALS + DELETE)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let currentTxType = null;

// ────────────────────────────────────────────────────────────────
// TRANSACTION MODAL (Paliekame kaip buvo)
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
    
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => {
        btn.classList.remove('bg-teal-500', 'text-black', 'border-teal-500');
    });
    
    modal.classList.remove('hidden');
}

export function setExpType(type, el) {
    vibrate();
    document.getElementById('tx-type').value = type;
    
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    el.classList.add('active');
    
    const fuelFields = document.getElementById('fuel-fields');
    if (fuelFields) {
        if (type === 'fuel') {
            fuelFields.classList.remove('hidden');
        } else {
            fuelFields.classList.add('hidden');
        }
    }
}

export async function confirmTx() {
    vibrate([20]);
    
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const category = document.getElementById('tx-type').value;
    
    if (!amount || amount <= 0) return showToast('Įvesk sumą', 'error');
    if (!category) return showToast('Pasirink kategoriją', 'error');
    
    try {
        if (currentTxType === 'in') {
            await saveIncome(amount, category);
        } else {
            await saveExpense(amount, category);
        }
        
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (error) {
        console.error('Transaction error:', error);
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
        category: category,
        amount: amount,
        created_at: new Date().toISOString()
    });
    
    if (error) throw error;
    
    // Jei yra aktyvi pamaina, atnaujiname jos bendrą sumą
    if (shiftId) {
        // Geriausia naudoti RPC, bet čia supaprastintas variantas
        const { data: shift } = await db
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('id', shiftId)
            .single();
        
        if (shift) {
            await db.from('finance_shifts')
                .update({ gross_earnings: (shift.gross_earnings || 0) + amount })
                .eq('id', shiftId);
        }
    }
    
    showToast(`+$${amount.toFixed(2)}`, 'success');
}

async function saveExpense(amount, category) {
    if (!state.activeShift) return showToast('Pradėk pamainą pirma!', 'error');
    
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
        const gallons = document.getElementById('tx-gal').value;
        const odometer = document.getElementById('tx-odo').value;
        if (gallons) expenseData.gallons = parseFloat(gallons);
        if (odometer) expenseData.odometer = parseInt(odometer);
    }
    
    const { error } = await db.from('expenses').insert(expenseData);
    if (error) throw error;
    
    showToast(`-$${amount.toFixed(2)}`, 'info');
}

// ────────────────────────────────────────────────────────────────
// AUDIT (ISTORIJA) - PATAISYTA VIZUALIKA IR TRYNIMAS
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
        
        // Reset delete button
        updateDeleteButton(); 
        
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
            
            // STILIUS: Adaptive Dark/Light Mode
            // bg-white = šviesiame mode balta
            // dark:bg-gray-800 = tamsiame mode tamsi
            // text-gray-900 = tamsus tekstas šviesiame fone (kad matytųsi)
            return `
                <div class="group relative bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between transition-colors">
                    <div class="flex items-center gap-4">
                        <input type="checkbox" 
                               value="${shift.id}" 
                               onchange="window.toggleLogSelection()" 
                               class="log-checkbox w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-500 bg-gray-100 dark:bg-gray-700 dark:border-gray-600">
                        
                        <div>
                            <p class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
                                ${date.getFullYear()}-${dateStr} • ${timeStr}
                            </p>
                            <p class="font-black text-gray-900 dark:text-white text-lg tracking-tight">${type}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <span class="text-lg font-bold text-green-600 dark:text-green-400">+$${earnings}</span>
                        <button class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-400 hover:text-teal-500 transition-colors">
                            <i class="fa-solid fa-pen text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Audit refresh error:', error);
        const listEl = document.getElementById('audit-list');
        if (listEl) {
            listEl.innerHTML = '<div class="text-center py-10 text-red-500 text-sm">Klaida užkraunant istoriją</div>';
        }
    }
}

// ────────────────────────────────────────────────────────────────
// DELETE LOGIC
// ────────────────────────────────────────────────────────────────

// Kviečiama kiekvieną kartą paspaudus checkbox
window.toggleLogSelection = function() {
    vibrate([5]); // Micro haptic
    updateDeleteButton();
};

function updateDeleteButton() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    const countSpan = document.getElementById('delete-count');
    
    if (checked.length > 0) {
        btn.classList.remove('hidden');
        countSpan.textContent = checked.length;
    } else {
        btn.classList.add('hidden');
    }
}

// Kviečiama paspaudus DELETE mygtuką
window.deleteLogs = async function() {
    vibrate([20]);
    
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    if (checkboxes.length === 0) return;
    
    const ids = Array.from(checkboxes).map(cb => cb.value);
    
    if (!confirm(`Ar tikrai ištrinti ${ids.length} įrašus?`)) return;
    
    state.loading = true;
    try {
        // 1. Ištriname susijusias išlaidas (cascade delete, jei DB nėra nustatyta)
        await db.from('expenses').delete().in('shift_id', ids);
        
        // 2. Ištriname pačias pamainas
        const { error } = await db.from('finance_shifts').delete().in('id', ids);
        
        if (error) throw error;
        
        showToast(`${ids.length} ištrinta`, 'success');
        refreshAudit(); // Atnaujiname sąrašą
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Klaida trinant: ' + error.message, 'error');
    } finally {
        state.loading = false;
    }
};

// ────────────────────────────────────────────────────────────────
// EXPORT & UTILS
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
