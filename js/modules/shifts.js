// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.1.3
// Logic: Timer, Atomic Shift Cycle & Odometer Check
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';
import { openModal, closeModals } from './ui.js';

let timerInterval = null;

// ────────────────────────────────────────────────────────────────
// TIMER ENGINE
// ────────────────────────────────────────────────────────────────

export function startTimer() {
    stopTimer(); 
    const el = document.getElementById('shift-timer');
    if (!el) return;
    
    updateTimerDisplay(); // Immediate update
    
    if (state.activeShift?.status === 'paused') {
        el.classList.add('pulse-text');
        return;
    }
    
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    const el = document.getElementById('shift-timer');
    if (el) el.classList.remove('pulse-text');
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if (!state.activeShift || !el) return;
    
    const start = new Date(state.activeShift.start_time).getTime();
    const diff = Math.floor((Date.now() - start) / 1000);
    
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(Math.max(0, diff % 60)).padStart(2, '0');
    
    el.textContent = `${h}:${m}:${s}`;
    
    // Visual cue for paused state
    el.classList.toggle('pulse-text', state.activeShift.status === 'paused');
}

// ────────────────────────────────────────────────────────────────
// START SHIFT LOGIC
// ────────────────────────────────────────────────────────────────

async function fetchLastOdometer(vehicleId) {
    if (!vehicleId) return 0;
    try {
        const { data } = await db.from('finance_shifts')
            .select('end_odo')
            .eq('vehicle_id', vehicleId)
            .eq('status', 'completed')
            .order('end_time', { ascending: false })
            .limit(1)
            .maybeSingle();
            
        return data?.end_odo || 0;
    } catch (e) { return 0; }
}

export async function openStartModal() {
    vibrate([10]);
    if (state.activeShift) {
        showToast('JAU TURI AKTYVIĄ PAMAINĄ', 'warning');
        return;
    }

    const sel = document.getElementById('start-vehicle');
    const odoInput = document.getElementById('start-odo');
    
    if (!sel || !odoInput) return;

    // Populate Vehicle List
    if (state.fleet.length > 0) {
        sel.innerHTML = state.fleet.map(v => 
            `<option value="${v.id}">${v.name}${v.is_test ? ' 🧪' : ''}</option>`
        ).join('');
    } else {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    }

    // Auto-fetch Odometer logic
    const refreshOdo = async () => {
        state.loading = true;
        const lastOdo = await fetchLastOdometer(sel.value);
        odoInput.value = lastOdo || ''; 
        odoInput.placeholder = lastOdo ? `Min: ${lastOdo}` : '000000';
        odoInput.dataset.min = lastOdo; // Store for validation
        state.loading = false;
    };

    sel.onchange = refreshOdo;
    await refreshOdo(); // Initial fetch
    
    openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = parseInt(document.getElementById('start-odo').value);
    const minOdo = parseInt(document.getElementById('start-odo').dataset.min || 0);
    const goal = parseFloat(document.getElementById('start-goal').value) || 12;

    if (!vid) return showToast('PASIRINKITE AUTOMOBILĮ', 'warning');
    if (isNaN(odo) || odo < minOdo) {
        return showToast(`RIDA NEGALI BŪTI MAŽESNĖ NEI ${minOdo}`, 'error');
    }

    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: odo,
            target_hours: goal,
            status: 'active',
            start_time: new Date().toISOString()
        });

        if (error) throw error;

        closeModals();
        window.dispatchEvent(new Event('refresh-data')); // Triggers app.js to update UI
        showToast('PAMAINA PRADĖTA 🚀', 'success');
        
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// END SHIFT LOGIC
// ────────────────────────────────────────────────────────────────

export function openEndModal() {
    vibrate([10]);
    if (!state.activeShift) return;
    
    // Pre-fill placeholder
    const endOdoInput = document.getElementById('end-odo');
    if (endOdoInput) {
        endOdoInput.placeholder = `Min: ${state.activeShift.start_odo}`;
        endOdoInput.value = '';
    }
    
    // Reset Weather
    document.getElementById('end-weather').value = '';
    document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('border-teal-500', 'bg-teal-500/20'));
    
    openModal('end-modal');
}

export async function confirmEnd() {
    vibrate([20]);
    if (!state.activeShift?.id) return;

    const endOdo = parseInt(document.getElementById('end-odo').value);
    const earnings = parseFloat(document.getElementById('end-earn').value) || 0;
    const carwashUsed = document.getElementById('end-carwash')?.checked;
    const startOdo = state.activeShift.start_odo;

    if (isNaN(endOdo) || endOdo < startOdo) {
        return showToast(`RIDA TURI BŪTI > ${startOdo}`, 'error');
    }

    state.loading = true;
    try {
        // 1. Transaction: Base Earnings (If any)
        if (earnings > 0) {
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                vehicle_id: state.activeShift.vehicle_id,
                type: 'income',
                category: 'bonus', // Or 'base'
                amount: earnings,
                created_at: new Date().toISOString()
            });
        }

        // 2. Transaction: Carwash (Analytical, $0 cost if membership)
        if (carwashUsed) {
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                vehicle_id: state.activeShift.vehicle_id,
                type: 'expense',
                category: 'maintenance',
                amount: 0, // Membership covers cost
                note: 'Wash Used',
                created_at: new Date().toISOString()
            });
        }

        // 3. Close Shift
        const { error } = await db.from('finance_shifts').update({
            end_odo: endOdo,
            end_time: new Date().toISOString(),
            gross_earnings: earnings,
            weather: document.getElementById('end-weather').value || 'clear',
            status: 'completed'
        }).eq('id', state.activeShift.id);

        if (error) throw error;

        stopTimer();
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('PAMAINA BAIGTA 🏁', 'success');

    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// UTILITIES
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
    if (!state.activeShift) return;
    vibrate();

    const oldStatus = state.activeShift.status;
    const newStatus = oldStatus === 'paused' ? 'active' : 'paused';
    
    // Optimistic Update
    state.activeShift.status = newStatus;
    window.dispatchEvent(new Event('refresh-data')); // Updates UI immediately

    try {
        const { error } = await db.from('finance_shifts')
            .update({ status: newStatus })
            .eq('id', state.activeShift.id);
            
        if (error) throw error;
        
        showToast(newStatus === 'active' ? 'DARBAS TĘSIAMAS' : 'PAUZĖ', 'info');
        
    } catch (e) {
        // Rollback
        state.activeShift.status = oldStatus;
        window.dispatchEvent(new Event('refresh-data'));
        showToast('KLAIDA SINCHRONIZUOJANT', 'error');
    }
}

export function selectWeather(type) {
    vibrate();
    const input = document.getElementById('end-weather');
    if (input) input.value = type;
    
    document.querySelectorAll('.weather-btn').forEach(btn => {
        // Check if the button's onclick contains the type string
        const isMatch = btn.getAttribute('onclick').includes(`'${type}'`);
        if (isMatch) {
            btn.classList.add('border-teal-500', 'bg-teal-500/20');
        } else {
            btn.classList.remove('border-teal-500', 'bg-teal-500/20');
        }
    });
}
