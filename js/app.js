/* ROBERT OS v1.1 - LOGIC ENGINE */

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co', // <--- PAKEISK
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy', // <--- PAKEISK
    VERSION: '1.1'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const state = new Proxy({
    user: null, fleet: [], activeShift: null, dailyCost: 0, 
    shiftEarnings: 0, txDirection: 'in', loading: false
}, {
    set(target, key, value) {
        target[key] = value;
        updateUI(key);
        return true;
    }
});

// --- INIT ---
async function init() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        await fetchFleet(); 
        await refreshAll(); 
        setupRealtime();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
}

// --- DATA ---
async function fetchFleet() {
    const { data } = await db.from('vehicles').select('*').eq('is_active', true);
    state.fleet = data || [];
}

async function refreshAll() {
    const { data: shift } = await db.from('finance_shifts').select('*').eq('status', 'active').maybeSingle();
    state.activeShift = shift;

    const { data: fixed } = await db.from('fixed_expenses').select('amount').eq('is_active', true);
    let monthlyFixed = fixed ? fixed.reduce((acc, item) => acc + item.amount, 0) : 0; 
    
    let vehicleCost = 0;
    if (shift) {
        const v = state.fleet.find(f => f.id === shift.vehicle_id);
        if (v) vehicleCost = v.operating_cost_weekly / 7;
    } else if (state.fleet.length > 0) {
        vehicleCost = state.fleet[0].operating_cost_weekly / 7;
    }

    state.dailyCost = (monthlyFixed / 30) + vehicleCost;
    state.shiftEarnings = 0; 
    
    updateGrindBar();
    refreshAudit();
}

async function refreshAudit() {
    const { data } = await db.from('finance_shifts').select('start_time, gross_earnings, vehicle_id').order('start_time', {ascending: false}).limit(5);
    const el = document.getElementById('audit-list');
    if(!el) return;
    
    if(data && data.length) {
        el.innerHTML = data.map(s => {
            const v = state.fleet.find(f => f.id === s.vehicle_id);
            const earn = s.gross_earnings || 0;
            return `
            <div class="bento-card flex-row justify-between items-center p-3 mb-2">
                <div>
                    <p class="text-[9px] text-gray-500 font-bold uppercase">${new Date(s.start_time).toLocaleDateString()}</p>
                    <p class="font-bold text-xs text-white">${v ? v.name : 'Unknown'}</p>
                </div>
                <p class="font-mono font-bold ${earn > 0 ? 'text-green-500' : 'text-gray-500'}">$${earn}</p>
            </div>`;
        }).join('');
    } else {
        el.innerHTML = '<div class="text-center py-4 opacity-50 text-xs">NO HISTORY</div>';
    }
}

// --- GARAGE (Add Vehicle) ---
function openGarage() {
    document.getElementById('veh-name').value = '';
    document.getElementById('veh-cost').value = '';
    setVehType('rental'); 
    document.getElementById('garage-modal').classList.remove('hidden');
}

function setVehType(type) {
    document.getElementById('veh-type').value = type;
    document.querySelectorAll('.veh-type-btn').forEach(b => {
        b.classList.remove('bg-teal-500', 'text-black', 'border-teal-500', 'opacity-100');
        b.classList.add('opacity-50');
    });
    const activeBtn = document.getElementById(`btn-type-${type}`);
    activeBtn.classList.remove('opacity-50');
    activeBtn.classList.add('bg-teal-500', 'text-black', 'border-teal-500', 'opacity-100');
}

async function saveVehicle() {
    const name = document.getElementById('veh-name').value;
    const cost = document.getElementById('veh-cost').value;
    const type = document.getElementById('veh-type').value;

    if (!name || !cost) return showToast('Name & Cost required', 'error');

    state.loading = true;
    try {
        const { error } = await db.from('vehicles').insert({
            user_id: state.user.id,
            name: name,
            type: type,
            operating_cost_weekly: parseFloat(cost),
            is_active: true
        });
        if (error) throw error;
        showToast('Vehicle Added!', 'success');
        closeModals();
        await fetchFleet(); 
    } catch (e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- SHIFT ---
function openStartModal() {
    const sel = document.getElementById('start-vehicle');
    if(state.fleet.length === 0) {
        sel.innerHTML = '<option value="">No vehicles! Add in Garage.</option>';
    } else {
        sel.innerHTML = state.fleet.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    }
    document.getElementById('start-modal').classList.remove('hidden');
}

async function confirmStart() {
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    const goal = document.getElementById('start-goal').value;
    
    if(!vid) return showToast('Select Vehicle', 'error');
    if(!odo) return showToast('Start Odometer Required', 'error');
    
    state.loading = true;
    try {
        await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: odo,
            goal_amount: goal || null,
            status: 'active'
        });
        closeModals();
        await refreshAll();
        showToast('Shift Started', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

async function togglePause() {
    if(!state.activeShift) return;
    const isPaused = !!state.activeShift.pause_start;
    state.loading = true;
    try {
        if(isPaused) {
            const diffSec = Math.floor((new Date() - new Date(state.activeShift.pause_start)) / 1000);
            await db.from('finance_shifts').update({
                pause_start: null,
                total_paused_seconds: (state.activeShift.total_paused_seconds || 0) + diffSec
            }).eq('id', state.activeShift.id);
            showToast('Resumed', 'success');
        } else {
            await db.from('finance_shifts').update({ pause_start: new Date().toISOString() }).eq('id', state.activeShift.id);
            showToast('Paused', 'success');
        }
        await refreshAll();
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

function openEndModal() { document.getElementById('end-modal').classList.remove('hidden'); }

async function confirmEnd() {
    const odo = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    if(!odo || !earn) return showToast('Enter ODO & Earnings', 'error');
    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: odo, gross_earnings: earn, end_time: new Date().toISOString(), status: 'completed'
        }).eq('id', state.activeShift.id);
        if(error) throw error;
        closeModals(); await refreshAll(); showToast('Shift Ended', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- TRANSACTIONS ---
function openTxModal(dir) {
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Income' : 'Expense';
    document.getElementById('tx-amount').value = '';
    const isExp = dir === 'out';
    document.getElementById('expense-types').classList.toggle('hidden', !isExp);
    document.getElementById('fuel-fields').classList.add('hidden');
    document.getElementById('tx-modal').classList.remove('hidden');
}

function setExpType(type) {
    document.getElementById('tx-type').value = type;
    document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    document.querySelectorAll('.exp-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black'));
    event.target.classList.add('bg-teal-500', 'text-black');
}

async function confirmTx() {
    const amt = parseFloat(document.getElementById('tx-amount').value);
    if(!amt) return;
    state.loading = true;
    try {
        if(state.txDirection === 'out') {
            const type = document.getElementById('tx-type').value;
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            if(type === 'fuel' && (!gal || !odo)) throw new Error('Fuel needs Gallons & ODO');
            
            await db.from('expenses').insert({
                user_id: state.user.id, shift_id: state.activeShift?.id, vehicle_id: state.activeShift?.vehicle_id,
                type: type, amount: amt, gallons: gal || null, odometer: odo || null
            });
        } else { showToast('Use End Shift for Earnings', 'info'); }
        closeModals(); await refreshAll(); showToast('Saved', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- EXPORT ---
async function exportAI() {
    state.loading = true;
    try {
        const { data, error } = await db.rpc('get_empire_report', { target_user_id: state.user.id });
        if(error) throw error;
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        showToast('Copied to Clipboard!', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- UI UTILS ---
function updateUI(key) {
    if(key === 'loading') document.getElementById('loading').classList.toggle('hidden', !state.loading);
    if(key === 'activeShift') {
        const hasShift = !!state.activeShift;
        document.getElementById('btn-start').classList.toggle('hidden', hasShift);
        document.getElementById('active-controls').classList.toggle('hidden', !hasShift);
        if(hasShift) startTimer(); else stopTimer();
    }
}
function updateGrindBar() {
    const target = Math.round(state.dailyCost);
    document.getElementById('grind-val').textContent = `$0 / $${target}`;
}
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden')); }
function showToast(msg, type='info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icon = type === 'error' ? 'triangle-exclamation' : 'check-circle';
    const color = type === 'error' ? 'text-red-500' : 'text-teal-500';
    t.innerHTML = `<i class="fa-solid fa-${icon} ${color}"></i> <span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${id}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`btn-${id}`).classList.add('active');
}
let timerInt;
function startTimer() {
    clearInterval(timerInt);
    timerInt = setInterval(() => {
        if(!state.activeShift) return;
        const start = new Date(state.activeShift.start_time).getTime();
        const now = new Date().getTime();
        let diff = Math.floor((now - start) / 1000);
        if(state.activeShift.total_paused_seconds) diff -= state.activeShift.total_paused_seconds;
        if(state.activeShift.pause_start) {
            diff -= Math.floor((now - new Date(state.activeShift.pause_start).getTime()) / 1000);
            document.getElementById('shift-timer').classList.add('text-yellow-500');
            document.getElementById('shift-timer').classList.remove('text-white');
        } else {
            document.getElementById('shift-timer').classList.remove('text-yellow-500');
            document.getElementById('shift-timer').classList.add('text-white');
        }
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        document.getElementById('shift-timer').textContent = `${h}:${m}:${s}`;
    }, 1000);
}
function stopTimer() { clearInterval(timerInt); document.getElementById('shift-timer').textContent = "00:00:00"; }
function setupRealtime() { db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe(); }
async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    const { error } = await db.auth.signInWithPassword({email, password});
    if(error) showToast(error.message, 'error'); else location.reload();
}
async function logout() { await db.auth.signOut(); location.reload(); }
function toggleTheme() { document.documentElement.classList.toggle('light'); }
document.addEventListener('DOMContentLoaded', init);
