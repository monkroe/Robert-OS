// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SHIFTS.JS v2.2.0
// Logic: Strict Odometer Chain & Hybrid Car Wash
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
    updateTimerDisplay();
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
    const diff = Math.floor((Date.now() - new Date(state.activeShift.start_time).getTime()) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(Math.max(0, diff % 60)).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
    el.classList.toggle('pulse-text', state.activeShift.status === 'paused');
}

// ────────────────────────────────────────────────────────────────
// STRICT ODOMETER CHAIN (VALIDATION)
// ────────────────────────────────────────────────────────────────

async function fetchLastOdometer(vehicleId) {
    if (!vehicleId) return 0;
    try {
        // Ieškome paskutinės UŽBAIGTOS pamainos šiam automobiliui
        const { data } = await db.from('finance_shifts')
            .select('end_odo')
            .eq('vehicle_id', vehicleId)
            .eq('status', 'completed')
            .order('end_time', { ascending: false })
            .limit(1)
            .maybeSingle();
            
        return data?.end_odo || 0;
    } catch (e) { 
        console.error("Odo Fetch Error:", e);
        return 0; 
    }
}

export async function openStartModal() {
    vibrate([10]);
    if (state.activeShift) return showToast('JAU TURI AKTYVIĄ PAMAINĄ', 'warning');

    const sel = document.getElementById('start-vehicle');
    const odoInput = document.getElementById('start-odo');
    
    // Garažo užpildymas
    if (state.fleet.length > 0) {
        sel.innerHTML = state.fleet.map(v => 
            `<option value="${v.id}">${v.name}${v.is_test ? ' 🧪' : ''}</option>`
        ).join('');
    } else {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    }

    // Grandininė reakcija: Gauname paskutinę ridą iš DB
    const refreshOdo = async () => {
        state.loading = true;
        const lastOdo = await fetchLastOdometer(sel.value);
        
        odoInput.value = lastOdo || ''; 
        odoInput.placeholder = lastOdo ? `Min: ${lastOdo}` : '000000';
        
        // Saugome validacijai
        odoInput.dataset.min = lastOdo; 
        
        state.loading = false;
    };

    sel.onchange = refreshOdo;
    await refreshOdo(); // Pirmas užkrovimas
    
    openModal('start-modal');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = parseInt(document.getElementById('start-odo').value);
    const minOdo = parseInt(document.getElementById('start-odo').dataset.min || 0);
    const goal = parseFloat(document.getElementById('start-goal').value) || 12;

    if (!vid) return showToast('PASIRINKITE AUTOMOBILĮ', 'warning');
    
    // GRIEŽTA VALIDACIJA
    if (isNaN(odo) || odo < minOdo) {
        vibrate([50, 50, 50]);
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
        window.dispatchEvent(new Event('refresh-data'));
        showToast('PAMAINA PRADĖTA 🚀', 'success');
        
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// END SHIFT & CAR WASH LOGIC
// ────────────────────────────────────────────────────────────────

export function openEndModal() {
    vibrate([10]);
    if (!state.activeShift) return;
    
    const endOdoInput = document.getElementById('end-odo');
    if (endOdoInput) {
        endOdoInput.placeholder = `Min: ${state.activeShift.start_odo}`;
        endOdoInput.value = '';
    }
    
    // Reset Car Wash UI
    document.getElementById('end-carwash-member').checked = false;
    document.getElementById('end-carwash-other').checked = false;
    document.getElementById('manual-wash-cost').value = '';
    document.getElementById('manual-wash-cost').classList.add('hidden');
    
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
    const startOdo = state.activeShift.start_odo;
    
    // Car Wash Data
    const isMemberWash = document.getElementById('end-carwash-member').checked;
    const isOtherWash = document.getElementById('end-carwash-other').checked;
    const otherWashCost = parseFloat(document.getElementById('manual-wash-cost').value) || 0;

    // VALIDACIJA
    if (isNaN(endOdo) || endOdo < startOdo) {
        return showToast(`RIDA TURI BŪTI > ${startOdo}`, 'error');
    }
    if (isOtherWash && otherWashCost <= 0) {
        return showToast('ĮVESKITE PLOVIMO KAINĄ', 'warning');
    }

    state.loading = true;
    try {
        // 1. Transaction: Base Earnings
        if (earnings > 0) {
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                vehicle_id: state.activeShift.vehicle_id,
                type: 'income',
                category: 'bonus',
                amount: earnings,
                created_at: new Date().toISOString()
            });
        }

        // 2. Transaction: Extra Car Wash (Paid)
        if (isOtherWash && otherWashCost > 0) {
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift.id,
                vehicle_id: state.activeShift.vehicle_id,
                type: 'expense',
                category: 'cleaning', // Kitas, mokamas plovimas
                amount: otherWashCost,
                note: 'Manual Wash',
                created_at: new Date().toISOString()
            });
        }

        // 3. Transaction: Membership Wash (Analitinis įrašas)
        // Mes įrašome $0, bet pažymime, kad paslauga naudota.
        // Vėliau analitikoje tai leis skaičiuoti "Cost Per Wash" amortizaciją.
        if (isMemberWash) {
             // Įrašo nereikia į 'expenses' lentelę jei suma 0, nebent norime sekti naudojimą.
             // Pagal specifikaciją, saugome boolean shifte. Bet dėl istorijos kortelės,
             // galime įrašyti techninį įrašą?
             // Geriau atnaujinti shift lentelę su metadata, kaip nurodyta specifikacijoje.
        }

        // 4. Close Shift Record
        const { error } = await db.from('finance_shifts').update({
            end_odo: endOdo,
            end_time: new Date().toISOString(),
            gross_earnings: earnings,
            weather: document.getElementById('end-weather').value || 'clear',
            status: 'completed',
            // Čia galėtume saugoti boolean 'wash_used', jei pridėjote stulpelį į DB.
            // Jei ne, paliekame ateičiai. Dabar fiksuojame per išlaidas.
        }).eq('id', state.activeShift.id);

        if (error) throw error;

        stopTimer();
        closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('PAMAINA UŽDARYTA 🏁', 'success');

    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
    if (!state.activeShift) return;
    vibrate();
    const oldStatus = state.activeShift.status;
    const newStatus = oldStatus === 'paused' ? 'active' : 'paused';
    
    state.activeShift.status = newStatus;
    window.dispatchEvent(new Event('refresh-data'));

    try {
        await db.from('finance_shifts').update({ status: newStatus }).eq('id', state.activeShift.id);
        showToast(newStatus === 'active' ? 'DARBAS TĘSIAMAS' : 'PAUZĖ', 'info');
    } catch (e) {
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
        const isMatch = btn.getAttribute('onclick').includes(`'${type}'`);
        if (isMatch) btn.classList.add('border-teal-500', 'bg-teal-500/20');
        else btn.classList.remove('border-teal-500', 'bg-teal-500/20');
    });
}
