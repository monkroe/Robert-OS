// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE v1.2 (INCOME FIX)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let currentTxType = null;

// ────────────────────────────────────────────────────────────────
// TRANSACTION MODAL
// ────────────────────────────────────────────────────────────────

export function openTxModal(type) {
    vibrate();
    currentTxType = type;
    
    const modal = document.getElementById('tx-modal');
    const title = document.getElementById('tx-title');
    const amountInput = document.getElementById('tx-amount');
    const expenseTypes = document.getElementById('expense-types');
    const fuelFields = document.getElementById('fuel-fields');
    
    if (!modal || !title || !amountInput) return;
    
    if (type === 'in') {
        title.textContent = 'PAJAMOS';
        if (expenseTypes) expenseTypes.classList.add('hidden');
        if (fuelFields) fuelFields.classList.add('hidden');
    } else {
        title.textContent = 'IŠLAIDOS';
        if (expenseTypes) expenseTypes.classList.remove('hidden');
        if (fuelFields) fuelFields.classList.add('hidden');
    }
    
    amountInput.value = '';
    document.getElementById('tx-type').value = 'other';
    
    document.querySelectorAll('.exp-btn').forEach(btn => {
        btn.classList.remove('bg-teal-500', 'text-black', 'border-teal-500');
    });
    
    modal.classList.remove('hidden');
}

export function setExpType(type) {
    vibrate();
    document.getElementById('tx-type').value = type;
    
    document.querySelectorAll('.exp-btn').forEach(btn => {
        btn.classList.remove('bg-teal-500', 'text-black', 'border-teal-500');
    });
    
    event.currentTarget.classList.add('bg-teal-500', 'text-black', 'border-teal-500');
    
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
    
    if (!amount || amount <= 0) {
        return showToast('Įvesk sumą', 'error');
    }
    
    try {
        if (currentTxType === 'in') {
            await saveIncome(amount);
        } else {
            await saveExpense(amount);
        }
        
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (error) {
        console.error('Transaction error:', error);
        showToast(error.message, 'error');
    }
}

// ────────────────────────────────────────────────────────────────
// INCOME (PAJAMOS) - VEIKIA BE AKTYVIOS PAMAINOS
// ────────────────────────────────────────────────────────────────

async function saveIncome(amount) {
    const shiftId = state.activeShift?.id || null;
    
    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: shiftId,
        vehicle_id: state.activeShift?.vehicle_id || null,
        type: 'income',
        category: 'tips',
        amount: amount,
        created_at: new Date().toISOString()
    });
    
    if (error) throw error;
    
    if (shiftId) {
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
    
    showToast(`+$${amount.toFixed(2)} 💰`, 'success');
}

// ────────────────────────────────────────────────────────────────
// EXPENSE (IŠLAIDOS)
// ────────────────────────────────────────────────────────────────

async function saveExpense(amount) {
    const type = document.getElementById('tx-type').value;
    
    if (!state.activeShift) {
        return showToast('Pradėk pamainą pirma!', 'error');
    }
    
    const expenseData = {
        user_id: state.user.id,
        shift_id: state.activeShift.id,
        vehicle_id: state.activeShift.vehicle_id,
        type: 'expense',
        category: type,
        amount: amount,
        created_at: new Date().toISOString()
    };
    
    if (type === 'fuel') {
        const gallons = document.getElementById('tx-gal').value;
        const odometer = document.getElementById('tx-odo').value;
        
        if (gallons) expenseData.gallons = parseFloat(gallons);
        if (odometer) expenseData.odometer = parseInt(odometer);
    }
    
    const { error } = await db.from('expenses').insert(expenseData);
    
    if (error) throw error;
    
    showToast(`-$${amount.toFixed(2)} 💸`, 'info');
}

// ────────────────────────────────────────────────────────────────
// AUDIT (ISTORIJA)
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
            
            return `
                <div class="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <input type="checkbox" class="w-5 h-5 rounded accent-teal-500">
                        <div>
                            <p class="text-xs opacity-50">${date.getFullYear()}-${dateStr} ${timeStr}</p>
                            <p class="font-bold">${type}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-sm opacity-50">${type}</span>
                        <span class="text-lg font-bold text-green-400">+$${earnings}</span>
                        <button class="text-gray-500 hover:text-white">✏️</button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Audit refresh error:', error);
        const listEl = document.getElementById('audit-list');
        if (listEl) {
            listEl.innerHTML = '<div class="text-center py-10 text-red-500 text-sm">Nepavyko užkrauti istorijos</div>';
        }
    }
}

// ────────────────────────────────────────────────────────────────
// EXPORT AI
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
```

---

## ✅ KAS PASIKEITĖ?

**Eilutės 86-117 - `saveIncome()` funkcija:**

```javascript
async function saveIncome(amount) {
    const shiftId = state.activeShift?.id || null; // ← GALI BŪTI NULL
    
    const { error } = await db.from('expenses').insert({
        user_id: state.user.id,
        shift_id: shiftId, // ← NULL jei nėra aktyvios pamainos
        // ...
    });
    
    // Jei yra shift - pridėti prie gross_earnings
    if (shiftId) {
        // ... atnaujinti shift
    }
}
