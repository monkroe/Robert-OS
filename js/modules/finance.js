// ════════════════════════════════════════════════════════════════
// ROBERT OS - FINANCE MODULE
// Versija: 1.2
// 
// ATSAKOMYBĖ: Transakcijos (IN/OUT) ir Istorija (Audit)
// Expense kategorijos, istorijos atvaizdavimas, AI export
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { closeModals } from './ui.js';

// ────────────────────────────────────────────────────────────────
// TRANSACTION MODAL - Atidarymas
// ────────────────────────────────────────────────────────────────

export function openTxModal(dir) {
    vibrate();
    state.txDirection = dir;
    
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Pajamos' : 'Išlaidos';
    document.getElementById('tx-amount').value = '';
    
    const isExpense = dir === 'out';
    document.getElementById('expense-types').classList.toggle('hidden', !isExpense);
    document.getElementById('fuel-fields').classList.add('hidden');
    
    document.getElementById('tx-modal').classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// EXPENSE TYPE - Pasirinkimas
// ────────────────────────────────────────────────────────────────

export function setExpType(type) {
    vibrate();
    document.getElementById('tx-type').value = type;
    
    // Rodyti/slėpti fuel laukus
    document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    
    // Highlight pasirinkta kategorija
    document.querySelectorAll('.exp-btn').forEach(btn => {
        btn.classList.remove('bg-teal-500', 'text-black', 'border-teal-500');
    });
    event.target.classList.add('bg-teal-500', 'text-black', 'border-teal-500');
}

// ────────────────────────────────────────────────────────────────
// TRANSACTION - Patvirtinimas
// ────────────────────────────────────────────────────────────────

export async function confirmTx() {
    vibrate([20]);
    const amt = parseFloat(document.getElementById('tx-amount').value);
    
    if (!amt) {
        return showToast('Įvesk sumą', 'error');
    }
    
    state.loading = true;
    
    try {
        if (state.txDirection === 'out') {
            // IŠLAIDOS
            const type = document.getElementById('tx-type').value;
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            
            // Validacija: Jei fuel, reikia gallons ir odometer
            if (type === 'fuel' && (!gal || !odo)) {
                state.loading = false;
                return showToast('Kurui reikia Litrų ir Ridos', 'error');
            }
            
            // Įrašyti į expenses lentelę
            const { error } = await db.from('expenses').insert({
                type: type,
                category: type, // Nauja versija naudoja 'category'
                amount: amt,
                gallons: gal ? parseFloat(gal) : null,
                odometer: odo ? parseInt(odo) : null,
                shift_id: state.activeShift?.id || null, // Susieti su shift (jei aktyvus)
                user_id: state.user.id
            });
            
            if (error) throw error;
            
            showToast('Išlaida įrašyta', 'success');
            
        } else {
            // PAJAMOS (IN)
            // Galima įvesti pamainos metu (pvz., cash tips)
            
            if (!state.activeShift) {
                state.loading = false;
                return showToast('Pradėk pamainą, kad įvestum pajamas', 'error');
            }
            
            // Atnaujinti aktyvios pamainos pajamas
            const currentCash = state.activeShift.income_cash || 0;
            const newCash = currentCash + amt;
            
            const { error } = await db.from('finance_shifts')
                .update({
                    income_cash: newCash,
                    gross_earnings: (state.activeShift.income_app || 0) + 
                                   (state.activeShift.income_private || 0) + 
                                   newCash
                })
                .eq('id', state.activeShift.id);
            
            if (error) throw error;
            
            showToast('Pajamos pridėtos', 'success');
        }
        
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        
    } catch (error) {
        console.error('Transaction error:', error);
        showToast(error.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// AUDIT - Istorijos atvaizdavimas
// ────────────────────────────────────────────────────────────────

let currentHistory = []; // Cache istorijos

export async function refreshAudit() {
    try {
        // 1. Gauti shifts (50 naujausių)
        const { data: shifts, error: shiftsError } = await db
            .from('finance_shifts')
            .select('id, start_time, end_time, gross_earnings, status, vehicle_id')
            .eq('user_id', state.user.id)
            .eq('status', 'completed')
            .order('end_time', { ascending: false })
            .limit(50);
        
        if (shiftsError) throw shiftsError;
        
        // 2. Gauti expenses (50 naujausių)
        const { data: expenses, error: expensesError } = await db
            .from('expenses')
            .select('id, created_at, amount, category')
            .eq('user_id', state.user.id)
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (expensesError) throw expensesError;
        
        // 3. Sujungti į vieną sąrašą
        let history = [];
        
        if (shifts) {
            shifts.forEach(s => {
                history.push({
                    id: s.id,
                    table: 'finance_shifts',
                    date: new Date(s.end_time),
                    amount: s.gross_earnings || 0,
                    type: 'SHIFT',
                    is_income: true,
                    raw: s
                });
            });
        }
        
        if (expenses) {
            expenses.forEach(e => {
                history.push({
                    id: e.id,
                    table: 'expenses',
                    date: new Date(e.created_at),
                    amount: e.amount || 0,
                    type: (e.category || e.type || 'OTHER').toUpperCase(),
                    is_income: false,
                    raw: e
                });
            });
        }
        
        // 4. Rūšiuoti pagal datą (naujausi viršuje)
        history.sort((a, b) => b.date - a.date);
        
        currentHistory = history; // Išsaugoti cache
        
        // 5. Render HTML
        renderAuditList(history);
        
    } catch (error) {
        console.error('Error refreshing audit:', error);
        showToast('Nepavyko užkrauti istorijos', 'error');
    }
}

// ────────────────────────────────────────────────────────────────
// AUDIT - HTML Rendering
// ────────────────────────────────────────────────────────────────

function renderAuditList(history) {
    const el = document.getElementById('audit-list');
    if (!el) return;
    
    // Valdymo juosta (Select All + Delete)
    let html = `
    <div class="flex justify-between items-center mb-3 px-1">
        <label class="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer">
            <input type="checkbox" id="hist-select-all" class="w-4 h-4 rounded bg-gray-700 border-gray-600">
            SELECT ALL
        </label>
        <button id="hist-delete-btn" class="hidden bg-red-500/20 text-red-500 px-3 py-1 rounded text-xs font-bold border border-red-500/50 hover:bg-red-500 hover:text-white transition">
            DELETE (<span id="hist-sel-count">0</span>)
        </button>
    </div>
    <div class="space-y-2">
    `;
    
    if (history.length > 0) {
        html += history.map(item => {
            const dateStr = item.date.toLocaleDateString('lt-LT');
            const timeStr = item.date.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
            
            return `
            <div class="bento-card flex flex-row items-center p-3 gap-3 animate-slideUp group">
                <input type="checkbox" 
                    class="hist-checkbox w-5 h-5 rounded bg-gray-800 border-gray-600 focus:ring-teal-500 text-teal-500" 
                    data-id="${item.id}" 
                    data-table="${item.table}">
                
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline">
                        <p class="text-[10px] text-gray-500 font-bold uppercase">
                            ${dateStr} ${timeStr}
                        </p>
                        <p class="text-[10px] text-gray-600 font-mono">${item.table === 'finance_shifts' ? 'SHIFT' : 'EXPENSE'}</p>
                    </div>
                    <div class="flex justify-between items-center mt-0.5">
                        <p class="font-bold text-xs uppercase tracking-wide truncate pr-2">${item.type}</p>
                        <p class="font-mono font-bold ${item.is_income ? 'text-green-500' : 'text-red-400'}">
                            ${item.is_income ? '+' : '-'}$${Math.round(item.amount)}
                        </p>
                    </div>
                </div>

                <button onclick="window.editItem('${item.id}', '${item.table}')" class="p-2 text-gray-600 hover:text-teal-400 active:scale-95 transition">
                    ✏️
                </button>
            </div>
            `;
        }).join('');
    } else {
        html += '<div class="text-center py-6 opacity-40 text-xs">ISTORIJA TUŠČIA</div>';
    }
    
    html += '</div>'; // Close space-y-2
    el.innerHTML = html;
    
    // Setup event listeners
    setupHistoryEvents();
}

// ────────────────────────────────────────────────────────────────
// AUDIT - Event Listeners (Select/Delete)
// ────────────────────────────────────────────────────────────────

function setupHistoryEvents() {
    const selectAll = document.getElementById('hist-select-all');
    const deleteBtn = document.getElementById('hist-delete-btn');
    const countSpan = document.getElementById('hist-sel-count');
    const checkboxes = document.querySelectorAll('.hist-checkbox');
    
    // Select All
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            vibrate();
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateDeleteBtn();
        });
    }
    
    // Individual checkboxes
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            vibrate();
            updateDeleteBtn();
            if (!cb.checked && selectAll) selectAll.checked = false;
        });
    });
    
    // Delete button
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            vibrate([30]);
            
            const selected = Array.from(document.querySelectorAll('.hist-checkbox:checked')).map(cb => ({
                id: cb.dataset.id,
                table: cb.dataset.table
            }));
            
            if (!confirm(`Ar tikrai ištrinti ${selected.length} įrašus?`)) return;
            
            state.loading = true;
            
            try {
                const shiftsToDelete = selected.filter(i => i.table === 'finance_shifts').map(i => i.id);
                const expensesToDelete = selected.filter(i => i.table === 'expenses').map(i => i.id);
                
                if (shiftsToDelete.length > 0) {
                    await db.from('finance_shifts').delete().in('id', shiftsToDelete);
                }
                
                if (expensesToDelete.length > 0) {
                    await db.from('expenses').delete().in('id', expensesToDelete);
                }
                
                showToast('Ištrinta sėkmingai 🗑️', 'success');
                window.dispatchEvent(new Event('refresh-data'));
                
            } catch (error) {
                console.error('Delete error:', error);
                showToast('Klaida trinant', 'error');
            } finally {
                state.loading = false;
            }
        });
    }
    
    function updateDeleteBtn() {
        const count = document.querySelectorAll('.hist-checkbox:checked').length;
        if (count > 0) {
            deleteBtn.classList.remove('hidden');
            countSpan.textContent = count;
        } else {
            deleteBtn.classList.add('hidden');
        }
    }
}

// ────────────────────────────────────────────────────────────────
// EDIT ITEM (Window exposed)
// ────────────────────────────────────────────────────────────────

window.editItem = async (id, table) => {
    vibrate();
    
    const item = currentHistory.find(i => i.id === id && i.table === table);
    if (!item) return;
    
    // Sukurti edit modalą (jei nėra)
    if (!document.getElementById('edit-modal-dynamic')) {
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
    
    // Užpildyti formą
    subtitle.textContent = `${item.type} (${item.date.toLocaleDateString('lt-LT')})`;
    input.value = item.amount;
    modal.classList.remove('hidden');
    
    const close = () => modal.classList.add('hidden');
    
    // Panaikinam senus listeners (klonavimo triukas)
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    
    newCancel.addEventListener('click', () => { vibrate(); close(); });
    
    newSave.addEventListener('click', async () => {
        vibrate();
        const newAmount = parseFloat(input.value);
        
        if (isNaN(newAmount)) {
            return showToast('Įvesk skaičių', 'error');
        }
        
        state.loading = true;
        close();
        
        try {
            let updateData = {};
            
            if (table === 'finance_shifts') {
                updateData = { gross_earnings: newAmount };
            } else {
                updateData = { amount: newAmount };
            }
            
            const { error } = await db.from(table).update(updateData).eq('id', id);
            if (error) throw error;
            
            showToast('Atnaujinta! ✅', 'success');
            window.dispatchEvent(new Event('refresh-data'));
            
        } catch (error) {
            console.error('Update error:', error);
            showToast('Klaida saugant', 'error');
        } finally {
            state.loading = false;
        }
    });
};

// ────────────────────────────────────────────────────────────────
// AI EXPORT (JSON for Claude/ChatGPT)
// ────────────────────────────────────────────────────────────────

export async function exportAI() {
    vibrate();
    state.loading = true;
    
    try {
        // Kviesti DB funkciją
        const { data, error } = await db.rpc('export_for_ai_assistant', {
            p_user_id: state.user.id,
            p_days_back: 30
        });
        
        if (error) throw error;
        
        // Kopijuoti į clipboard
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        
        // Įrašyti export istoriją
        await db.from('export_history').insert({
            user_id: state.user.id,
            export_type: 'ai_assistant',
            file_format: 'json',
            date_range_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            date_range_end: new Date().toISOString().split('T')[0]
        });
        
        showToast('✅ Nukopijuota į Clipboard!', 'success');
        
    } catch (error) {
        console.error('Export error:', error);
        showToast('Klaida eksportuojant', 'error');
    } finally {
        state.loading = false;
    }
}
