// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v1.6.0
// Transactions & History Management (No Alerts)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let currentTxType = null;
let idsToDelete = [];

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
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => btn.classList.remove('active'));
    
    window.openModal('tx-modal');
}

export function setExpType(type, el) {
    vibrate();
    document.getElementById('tx-type').value = type;
    
    document.querySelectorAll('.exp-btn, .inc-btn').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');

    const fuelFields = document.getElementById('fuel-fields');
    if (fuelFields) {
        if (type === 'fuel') fuelFields.classList.remove('hidden');
        else fuelFields.classList.add('hidden');
    }
}

// ────────────────────────────────────────────────────────────────
// SAVE TRANSACTION
// ────────────────────────────────────────────────────────────────

export async function confirmTx() {
    vibrate([20]);
    const amountEl = document.getElementById('tx-amount');
    const amount = parseFloat(amountEl.value);
    const category = document.getElementById('tx-type').value;

    if (!amount || amount <= 0) return showToast('Įvesk sumą', 'error');
    if (!category) return showToast('Pasirink kategoriją', 'error');

    state.loading = true;
    try {
        if (currentTxType === 'in') {
            await saveIncome(amount, category);
        } else {
            await saveExpense(amount, category);
        }

        window.closeModals();
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
    // Robert OS Logika: Tips ir Bonus SKAIČIUOJAMI į Daily Target (Gross Earnings)
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
    if (!state.activeShift) throw new Error('Išlaidoms reikia aktyvios pamainos');
    
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
        const gal = document.getElementById('tx-gal').value;
        const odo = document.getElementById('tx-odo').value;
        if (gal) expenseData.gallons = parseFloat(gal);
        if (odo) expenseData.odometer = parseInt(odo);
    }
    
    const { error } = await db.from('expenses').insert(expenseData);
    if (error) throw error;
    
    showToast(`-$${amount.toFixed(2)}`, 'info');
}

// ────────────────────────────────────────────────────────────────
// HISTORY & DELETION (NO ALERTS)
// ────────────────────────────────────────────────────────────────

export async function refreshAudit() {
    // Audit list generavimas yra App.js / UI lygmenyje arba čia, 
    // bet kadangi tavo ankstesniame faile tai buvo čia, paliekame.
    // TIK SVARBU: Čia turi būti švarus HTML generavimas.
    
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
        window.updateDeleteButton(); // Hide delete button

        if (!shifts || shifts.length === 0) {
            listEl.innerHTML = '<div class="text-center py-10 opacity-50 text-sm">Nėra istorijos</div>';
            return;
        }

        listEl.innerHTML = shifts.map(shift => {
            const start = new Date(shift.start_time);
            const dateStr = start.toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit' });
            const timeStr = start.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
            const earn = shift.gross_earnings || 0;
            const statusColor = shift.status === 'completed' ? 'text-gray-400' : 'text-teal-500 animate-pulse';
            
            return `
            <div class="log-card group relative bg-white dark:bg-[#111] rounded-xl p-4 border border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <input type="checkbox" value="${shift.id}" onchange="updateDeleteButton()" class="log-checkbox w-5 h-5 rounded border-gray-600 bg-gray-800 text-teal-500 accent-teal-500">
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

// Global functions for HTML interaction
window.toggleSelectAll = function() {
    vibrate();
    const master = document.getElementById('select-all-logs');
    const boxes = document.querySelectorAll('.log-checkbox');
    boxes.forEach(b => b.checked = master.checked);
    window.updateDeleteButton();
};

window.updateDeleteButton = function() {
    const checked = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btn-delete-logs');
    const count = document.getElementById('delete-count');
    
    if (btn && count) {
        count.textContent = checked.length;
        if (checked.length > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
};

window.requestDelete = function() {
    vibrate();
    const checked = document.querySelectorAll('.log-checkbox:checked');
    if (checked.length === 0) return;
    
    idsToDelete = Array.from(checked).map(c => c.value);
    
    const countEl = document.getElementById('del-modal-count');
    if (countEl) countEl.textContent = idsToDelete.length;
    
    // Čia atidarome TAVO stilingą modalą
    window.openModal('delete-modal');
};

window.confirmDelete = async function() {
    vibrate([20]);
    if (idsToDelete.length === 0) return;
    
    state.loading = true;
    try {
        // Pirma ištriname expenses (foreign key constraint)
        await db.from('expenses').delete().in('shift_id', idsToDelete);
        // Tada shifts
        const { error } = await db.from('finance_shifts').delete().in('id', idsToDelete);
        
        if (error) throw error;
        
        showToast(`${idsToDelete.length} įrašai ištrinti`, 'success');
        window.closeModals();
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
