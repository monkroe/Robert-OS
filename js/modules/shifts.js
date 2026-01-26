// ════════════════════════════════════════════════════════════════
// ROBERT OS - SHIFTS MODULE v1.7.2 (FIXED)
// Shift Management with Odometer Validation & Professional Icons
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

let timerInterval = null;

// ────────────────────────────────────────────────────────────────
// 1. INITIALIZATION (Inject HTML)
// ────────────────────────────────────────────────────────────────

export function initShiftsModals() {
    console.log('⏱️ Shifts modals injected');
    
    const container = document.getElementById('modals-container');
    if (!container) return;

    container.innerHTML += `
        <div id="start-modal" class="modal-overlay hidden">
            <div class="modal-card max-w-sm">
                <div class="modal-header">
                    <h3 class="font-black text-lg">PRADĖTI PAMAINĄ</h3>
                    <button onclick="closeModals()" class="text-xl opacity-50">&times;</button>
                </div>
                
                <div class="modal-body space-y-4">
                    <div>
                        <label class="text-xs font-bold opacity-50 ml-1 uppercase">Automobilis</label>
                        <div class="relative">
                            <select id="start-vehicle" class="input-field appearance-none">
                                <option>Loading...</option>
                            </select>
                            <div class="absolute right-3 top-3 pointer-events-none opacity-50">
                                <i class="fa-solid fa-chevron-down"></i>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label class="text-xs font-bold opacity-50 ml-1 uppercase">Rida (Start)</label>
                        <input type="number" id="start-odo" class="input-field font-mono text-lg" placeholder="000000">
                    </div>

                    <div>
                        <label class="text-xs font-bold opacity-50 ml-1 uppercase">Tikslas (Val.)</label>
                        <input type="number" id="start-goal" class="input-field" value="12">
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button onclick="confirmStart()" class="btn-primary-os w-full">
                        <i class="fa-solid fa-play mr-2"></i> PRADĖTI
                    </button>
                </div>
            </div>
        </div>

        <div id="end-modal" class="modal-overlay hidden">
            <div class="modal-card max-w-sm">
                <div class="modal-header">
                    <h3 class="font-black text-lg text-red-500">BAIGTI PAMAINĄ</h3>
                    <button onclick="closeModals()" class="text-xl opacity-50">&times;</button>
                </div>
                
                <div class="modal-body space-y-4">
                    <div>
                        <label class="text-xs font-bold opacity-50 ml-1 uppercase">Rida (End)</label>
                        <input type="number" id="end-odo" class="input-field font-mono text-lg" placeholder="000000">
                    </div>

                    <div>
                        <label class="text-xs font-bold opacity-50 ml-1 uppercase">Uždarbis (Programėlės)</label>
                        <input type="number" id="end-earn" class="input-field text-green-400 font-bold" placeholder="0.00" step="0.01">
                    </div>

                    <div>
                        <label class="text-xs font-bold opacity-50 ml-1 uppercase mb-2 block">Orai</label>
                        <div class="grid grid-cols-4 gap-2">
                            <button onclick="selectWeather('sun')" class="weather-btn p-3 border border-gray-700 rounded-lg text-2xl opacity-50 hover:opacity-100 transition-all">☀️</button>
                            <button onclick="selectWeather('cloud')" class="weather-btn p-3 border border-gray-700 rounded-lg text-2xl opacity-50 hover:opacity-100 transition-all">☁️</button>
                            <button onclick="selectWeather('rain')" class="weather-btn p-3 border border-gray-700 rounded-lg text-2xl opacity-50 hover:opacity-100 transition-all">🌧️</button>
                            <button onclick="selectWeather('snow')" class="weather-btn p-3 border border-gray-700 rounded-lg text-2xl opacity-50 hover:opacity-100 transition-all">❄️</button>
                        </div>
                        <input type="hidden" id="end-weather" value="">
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button onclick="confirmEnd()" class="btn-primary-os w-full bg-red-500 border-red-500 text-white shadow-red-500/20">
                        <i class="fa-solid fa-stop mr-2"></i> BAIGTI
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// TIMER LOGIC
// ────────────────────────────────────────────────────────────────

export function startTimer() {
    stopTimer();
    
    if (state.activeShift?.status === 'paused') {
        const el = document.getElementById('shift-timer');
        if (el) {
            updateTimerDisplay();
            el.classList.add('pulse-text');
        }
        return;
    }
    
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    const el = document.getElementById('shift-timer');
    if (el) {
        el.classList.remove('pulse-text');
    }
}

function updateTimerDisplay() {
    const el = document.getElementById('shift-timer');
    if (!state.activeShift || !el) return;
    
    // If paused, show the frozen time duration (calculated in app.js or backend)
    // But for simplicity, we calculate from start time minus pause duration
    
    const start = new Date(state.activeShift.start_time).getTime();
    const now = Date.now();
    
    let diff = Math.floor((now - start) / 1000);
    
    // Adjust for pause duration if stored (simplified here)
    if (state.activeShift.total_paused_seconds) {
        diff -= state.activeShift.total_paused_seconds;
    }
    
    if (diff < 0) diff = 0;
    
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    
    el.textContent = `${h}:${m}:${s}`;
    
    if (state.activeShift.status === 'paused') {
        el.classList.add('pulse-text');
    } else {
        el.classList.remove('pulse-text');
    }
}

// Cleanup
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (timerInterval) clearInterval(timerInterval);
    });
}

// ────────────────────────────────────────────────────────────────
// START SHIFT
// ────────────────────────────────────────────────────────────────

export function openStartModal() {
    vibrate();
    if (state.activeShift) return showToast('Jau turi aktyvią pamainą!', 'error');
    
    // Populate select
    const sel = document.getElementById('start-vehicle');
    if (!sel) {
        // Retry if modal just injected
        setTimeout(openStartModal, 50); 
        return;
    }
    
    if (state.fleet.length === 0) {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    } else {
        sel.innerHTML = state.fleet
            .filter(v => v.is_active)
            .map(v => {
                const currentOdo = v.last_odo || v.initial_odometer || 0;
                const typeIcon = v.is_test ? '🚖 ' : '';
                return `<option value="${v.id}">${typeIcon}${v.name}</option>`;
            })
            .join('');
    }
    
    // Pre-fill logic
    const updateOdo = () => {
        const vid = sel.value;
        const vehicle = state.fleet.find(v => v.id === vid);
        const odoInput = document.getElementById('start-odo');
        if (vehicle && odoInput) {
            const lastOdo = vehicle.last_odo || vehicle.initial_odometer || '';
            odoInput.value = lastOdo;
            odoInput.placeholder = lastOdo ? `Last: ${lastOdo}` : '000000';
        }
    };
    
    sel.onchange = updateOdo;
    updateOdo(); // Run once
    
    document.getElementById('start-goal').value = state.userSettings?.default_shift_target_hours || 12;
    
    if (window.openModal) window.openModal('start-modal');
    else document.getElementById('start-modal').classList.remove('hidden');
}

export async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odoInput = document.getElementById('start-odo').value;
    const goal = document.getElementById('start-goal').value;

    if (!vid) return showToast('Pasirink mašiną', 'error');
    if (!odoInput) return showToast('Įvesk ridą', 'error');
    
    const odo = parseInt(odoInput);
    if (isNaN(odo) || odo < 0) return showToast('Neteisinga rida', 'error');

    state.loading = true;
    try {
        // Validation: Check against last shift end_odo
        const { data: lastShift } = await db
            .from('finance_shifts')
            .select('end_odo')
            .eq('user_id', state.user.id)
            .eq('vehicle_id', vid)
            .eq('status', 'completed')
            .order('end_time', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (lastShift && lastShift.end_odo && odo < lastShift.end_odo) {
            vibrate([50, 50]);
            return showToast(`❌ Rida negali būti mažesnė nei ${lastShift.end_odo}`, 'error');
        }

        const { error } = await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: odo,
            target_hours: goal ? parseFloat(goal) : null,
            status: 'active',
            start_time: new Date().toISOString()
        });

        if (error) throw error;

        if (window.closeModals) window.closeModals();
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina pradėta 🚀', 'success');
        
    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// END SHIFT
// ────────────────────────────────────────────────────────────────

export function openEndModal() {
    vibrate();
    if (!state.activeShift) return showToast('Nėra aktyvios pamainos', 'error');
    
    const endOdoInput = document.getElementById('end-odo');
    const endEarnInput = document.getElementById('end-earn');
    const weatherInput = document.getElementById('end-weather');
    
    if (endOdoInput) {
        endOdoInput.value = '';
        endOdoInput.placeholder = `Min: ${state.activeShift.start_odo}`;
    }
    if (endEarnInput) endEarnInput.value = '';
    if (weatherInput) weatherInput.value = '';
    
    // Reset weather buttons
    document.querySelectorAll('.weather-btn').forEach(btn => {
         btn.className = 'weather-btn p-3 border border-gray-700 rounded-lg text-2xl opacity-50 hover:opacity-100 transition-all';
    });
    
    if (window.openModal) window.openModal('end-modal');
}

export function selectWeather(type) {
    vibrate();
    const input = document.getElementById('end-weather');
    if (input) input.value = type;

    document.querySelectorAll('.weather-btn').forEach(btn => {
        // Reset all
        btn.className = 'weather-btn p-3 border border-gray-700 rounded-lg text-2xl opacity-50 transition-all';
        // Highlight active
        if (btn.getAttribute('onclick').includes(type)) {
            btn.className = 'weather-btn p-3 border border-teal-500 bg-teal-500/20 rounded-lg text-2xl shadow-[0_0_10px_rgba(20,184,166,0.3)] scale-110 transition-all';
        }
    });
}

export async function confirmEnd() {
    vibrate([20]);
    const odoInput = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    const weather = document.getElementById('end-weather').value;

    if (!odoInput) return showToast('Įvesk ridą', 'error');
    
    const odo = parseInt(odoInput);
    const startOdo = state.activeShift.start_odo;
    
    if (isNaN(odo)) return showToast('Neteisinga rida', 'error');
    if (odo < startOdo) return showToast(`Rida negali būti mažesnė nei ${startOdo}`, 'error');

    state.loading = true;
    try {
        const { error: shiftError } = await db.from('finance_shifts').update({
            end_odo: odo,
            end_time: new Date().toISOString(),
            gross_earnings: earn ? parseFloat(earn) : 0,
            weather: weather || null,
            status: 'completed'
        }).eq('id', state.activeShift.id);

        if (shiftError) throw shiftError;

        // Update Vehicle Odometer
        await db.from('vehicles').update({
            last_odo: odo
        }).eq('id', state.activeShift.vehicle_id);

        stopTimer();
        const el = document.getElementById('shift-timer');
        if (el) el.textContent = "00:00:00";

        if (window.closeModals) window.closeModals();
        
        window.dispatchEvent(new Event('refresh-data'));
        showToast('Pamaina baigta 🏁', 'success');

    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        state.loading = false; 
    }
}

// ────────────────────────────────────────────────────────────────
// PAUSE / RESUME
// ────────────────────────────────────────────────────────────────

export async function togglePause() {
    vibrate();
    if (!state.activeShift) return;
    
    const isPaused = state.activeShift.status === 'paused';
    const newStatus = isPaused ? 'active' : 'paused';
    
    // Optimistic UI Update
    const oldStatus = state.activeShift.status;
    state.activeShift.status = newStatus;
    updatePauseButton(newStatus); // Update UI immediately
    
    if (newStatus === 'paused') stopTimer();
    else startTimer();

    try {
        const { error } = await db.from('finance_shifts')
            .update({ 
                status: newStatus,
                // If pausing, we might want to track pause_start_time in DB, 
                // but for v1.7.2 we just toggle status.
            })
            .eq('id', state.activeShift.id);
        
        if (error) throw error;
        
        showToast(isPaused ? 'Tęsiama ▶️' : 'Pauzė ⏸️', 'info');
        
    } catch (error) {
        console.error('Toggle pause error:', error);
        // Revert
        state.activeShift.status = oldStatus;
        updatePauseButton(oldStatus);
        if (oldStatus === 'active') startTimer(); else stopTimer();
        showToast('Klaida keičiant statusą', 'error');
    }
}

function updatePauseButton(status) {
    const btn = document.getElementById('btn-pause');
    if (!btn) return;
    
    if (status === 'paused') {
        btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        btn.className = 'col-span-1 btn-bento bg-green-500/10 text-green-500 border-green-500/50 transition-all';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        btn.className = 'col-span-1 btn-bento bg-yellow-500/10 text-yellow-500 border-yellow-500/50 transition-all';
    }
}

// ────────────────────────────────────────────────────────────────
// WINDOW EXPORTS
// ────────────────────────────────────────────────────────────────

window.openStartModal = openStartModal;
window.confirmStart = confirmStart;
window.openEndModal = openEndModal;
window.confirmEnd = confirmEnd;
window.togglePause = togglePause;
window.selectWeather = selectWeather;
