/* ═══════════════════════════════════════════════════════════
   ROBERT OS v1.0 - CONSTITUTIONAL ENGINE
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co', 
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy',
    VERSION: '1.0'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const state = new Proxy({
    user: null,
    fleet: [], // Čia saugosime mašinas
    activeShift: null,
    
    // Grind Metrics
    dailyCost: 0, // Rental/7 + Fixed/30
    shiftEarnings: 0, // Ką uždirbai šioje pamainoje
    
    // UI State
    txDirection: 'in',
    loading: false
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
        
        await fetchFleet(); // Užkraunam mašinas
        await refreshAll(); // Užkraunam duomenis
        
        setupRealtime();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
}

// --- CORE DATA FETCHING ---
async function fetchFleet() {
    const { data } = await db.from('vehicles').select('*').eq('is_active', true);
    state.fleet = data || [];
}

async function refreshAll() {
    // 1. Active Shift
    const { data: shift } = await db.from('finance_shifts').select('*').eq('status', 'active').maybeSingle();
    state.activeShift = shift;

    // 2. Grind Metrics (Konstitucinis Skaičiavimas)
    // Paimam fiksuotas išlaidas
    const { data: fixed } = await db.from('fixed_expenses').select('amount, frequency').eq('is_active', true);
    let monthlyFixed = fixed ? fixed.reduce((acc, item) => acc + item.amount, 0) : 0; // Supaprastinta (laikome viską monthly v1.0)
    
    let vehicleCost = 0;
    if (shift) {
        // Jei dirbam, imam to automobilio kaštus
        const v = state.fleet.find(f => f.id === shift.vehicle_id);
        if (v) vehicleCost = v.operating_cost_weekly / 7;
    } else if (state.fleet.length > 0) {
        // Jei nedirbam, imam "pagrindinės" (pirmos) mašinos kaštus prognozei
        vehicleCost = state.fleet[0].operating_cost_weekly / 7;
    }

    state.dailyCost = (monthlyFixed / 30) + vehicleCost;
    
    // 3. Earnings (Shift)
    if(shift) {
        // Čia galima pridėti logiką, jei vedame pajamas eigoje. 
        // Kol kas v1.0 earnings vedami END SHIFT metu, todėl "Shift Earnings" rodo 0 arba tai, kas įvesta "IN" transakcijose.
        // Pagal konstituciją: Expenses rašomos į 'expenses' lentelę, o 'gross_earnings' įrašomas tik gale.
        // Tačiau, kad "Grind Bar" judėtų, mums reikia "Realizuotų Pajamų".
        // v1.0 sprendimas: Grind Bar rodo kiek liko padengti kaštus.
        state.shiftEarnings = 0; // Kol kas 0, kol nepradėsim vesti tarpinių pajamų.
    }
    
    updateGrindBar();
    refreshAudit();
}

async function refreshAudit() {
    // Paimam paskutines 5 pamainas
    const { data } = await db.from('finance_shifts').select('start_time, end_time, gross_earnings, vehicle_id').order('start_time', {ascending: false}).limit(5);
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
                    <p class="font-bold text-xs text-white">${v ? v.name : 'Unknown Vehicle'}</p>
                </div>
                <p class="font-mono font-bold ${earn > 0 ? 'text-green-500' : 'text-gray-500'}">$${earn}</p>
            </div>`;
        }).join('');
    } else {
        el.innerHTML = '<div class="text-center py-4 opacity-50 text-xs">NO HISTORY</div>';
    }
}

// --- SHIFT LOGIC ---
function openStartModal() {
    const sel = document.getElementById('start-vehicle');
    sel.innerHTML = state.fleet.map(v => `<option value="${v.id}">${v.name} ($${v.operating_cost_weekly}/wk)</option>`).join('');
    document.getElementById('start-modal').classList.remove('hidden');
}

async function confirmStart() {
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    const goal = document.getElementById('start-goal').value;
    
    if(!vid || !odo) return showToast('Vehicle & ODO required', 'error');
    
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
            // Resume
            // Reikia SQL funkcijos arba logikos, bet v1.0 paprastumo dėlei darome update
            // Čia supaprastinta: (Dabar - pause_start) pridedam prie total
            const pauseTime = new Date(state.activeShift.pause_start);
            const diffSec = Math.floor((new Date() - pauseTime) / 1000);
            
            await db.from('finance_shifts').update({
                pause_start: null,
                total_paused_seconds: (state.activeShift.total_paused_seconds || 0) + diffSec
            }).eq('id', state.activeShift.id);
            showToast('Resumed', 'success');
        } else {
            // Pause
            await db.from('finance_shifts').update({
                pause_start: new Date().toISOString()
            }).eq('id', state.activeShift.id);
            showToast('Paused', 'success');
        }
        await refreshAll();
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

function openEndModal() { document.getElementById('end-modal').classList.remove('hidden'); }

async function confirmEnd() {
    const odo = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    
    if(!odo || !earn) return showToast('ODO & Earnings required', 'error');
    
    state.loading = true;
    try {
        const { error } = await db.from('finance_shifts').update({
            end_odo: odo,
            gross_earnings: earn,
            end_time: new Date().toISOString(),
            status: 'completed'
        }).eq('id', state.activeShift.id);
        
        if(error) throw error;
        
        closeModals();
        await refreshAll();
        showToast('Shift Completed', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- TRANSACTIONS ---
function openTxModal(dir) {
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Income' : 'Expense';
    document.getElementById('tx-amount').value = '';
    
    const isExp = dir === 'out';
    document.getElementById('expense-types').classList.toggle('hidden', !isExp);
    document.getElementById('fuel-fields').classList.add('hidden'); // Reset
    
    document.getElementById('tx-modal').classList.remove('hidden');
}

function setExpType(type) {
    document.getElementById('tx-type').value = type;
    document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    // Visual feedback
    document.querySelectorAll('.exp-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black'));
    event.target.classList.add('bg-teal-500', 'text-black');
}

async function confirmTx() {
    const amt = parseFloat(document.getElementById('tx-amount').value);
    if(!amt) return;
    
    state.loading = true;
    try {
        if(state.txDirection === 'out') {
            // Expense Logic
            const type = document.getElementById('tx-type').value;
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            
            if(type === 'fuel' && (!gal || !odo)) throw new Error('Fuel requires Gallons & ODO');
            
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift?.id,
                vehicle_id: state.activeShift?.vehicle_id,
                type: type,
                amount: amt,
                gallons: gal || null,
                odometer: odo || null
            });
        } else {
            // Income Logic (Tarpinė)
            // v1.0 konstitucija sako, kad Gross Earnings fiksuojami gale.
            // Bet jei norime vesti tarpines pajamas (pvz. cash tips), galime naudoti atskirą lentelę arba tiesiog ignoruoti.
            // Kol kas v1.0 UI: Income mygtukas tiesiog parodo Toast (nes DB earnings yra Shift stulpelis).
            showToast('Earnings logged at End Shift', 'info');
        }
        closeModals();
        await refreshAll();
        showToast('Saved', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- AI EXPORT ---
async function exportAI() {
    state.loading = true;
    try {
        const { data, error } = await db.rpc('get_empire_report', { target_user_id: state.user.id });
        if(error) throw error;
        
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        showToast('Empire Data Copied to Clipboard!', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- UI UPDATERS ---
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
    // Čia yra v1.0 Grind Bar logika
    // Target = Daily Cost (Rental/7 + Fixed/30)
    // Current = Shift Earnings (kurie kol kas vvedami tik gale)
    // TAI YRA TOBULINTINA VIETA: Reikia mechanizmo vesti pajamas eigoje, kad baras judėtų.
    // Kol kas rodysime Target.
    
    const target = Math.round(state.dailyCost);
    document.getElementById('grind-val').textContent = `$0 / $${target}`;
    document.getElementById('grind-label').textContent = 'DAILY COST COVERAGE';
    // Bar is empty until earnings logic is added
}

// --- UTILS ---
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden')); }
function showToast(msg, type='info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fa-solid fa-${type==='error'?'triangle-exclamation':'check-circle'}"></i> <span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${id}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`btn-${id}`).classList.add('active');
}

// Timer Logic (Su Pause palaikymu)
let timerInt;
function startTimer() {
    clearInterval(timerInt);
    timerInt = setInterval(() => {
        if(!state.activeShift) return;
        
        const start = new Date(state.activeShift.start_time).getTime();
        const now = new Date().getTime();
        let diff = Math.floor((now - start) / 1000);
        
        // Atimame pauzes
        if(state.activeShift.total_paused_seconds) diff -= state.activeShift.total_paused_seconds;
        
        // Jei dabar pauzėje
        if(state.activeShift.pause_start) {
            const pauseStart = new Date(state.activeShift.pause_start).getTime();
            const currentPause = Math.floor((now - pauseStart) / 1000);
            diff -= currentPause;
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

// Auth
async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    const { error } = await db.auth.signInWithPassword({email, password});
    if(error) showToast(error.message, 'error'); else location.reload();
}
async function logout() { await db.auth.signOut(); location.reload(); }
function toggleTheme() { document.documentElement.classList.toggle('light'); }

document.addEventListener('DOMContentLoaded', init);
