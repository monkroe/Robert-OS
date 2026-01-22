/* ═══════════════════════════════════════════════════════════
   ROBERT OS v1.0 - CONSTITUTIONAL LOGIC (FINAL)
   Grįžta prie originalios 'expenses' + 'shifts' struktūros
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co', // <--- ĮRAŠYK
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy', // <--- ĮRAŠYK
    VERSION: '1.0-Final'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Haptic (Paliekame, nes tai geras UX)
const vibrate = (pattern = [10]) => { if (navigator.vibrate) navigator.vibrate(pattern); };

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

// --- DATA FETCHING ---
async function fetchFleet() {
    // 1.0 SQL naudoja 'operating_cost_weekly'
    const { data } = await db.from('vehicles').select('*').eq('is_active', true);
    state.fleet = data || [];
}

async function refreshAll() {
    const { data: shift } = await db.from('finance_shifts').select('*').eq('status', 'active').maybeSingle();
    state.activeShift = shift;

    const monthlyFixed = 2500; 
    
    let vehicleCost = 0;
    if (shift) {
        const v = state.fleet.find(f => f.id === shift.vehicle_id);
        if (v) vehicleCost = v.operating_cost_weekly / 7;
    } else if (state.fleet.length > 0) {
        // Fallback į pirmą mašiną
        if (state.fleet[0].operating_cost_weekly) vehicleCost = state.fleet[0].operating_cost_weekly / 7;
    }

    state.dailyCost = (monthlyFixed / 30) + vehicleCost;
    state.shiftEarnings = shift?.gross_earnings || 0; 
    
    updateGrindBar();
    refreshAudit();
}

async function refreshAudit() {
    // ČIA YRA MAGIJA: Sujungiame dvi lenteles be jokio SQL keitimo
    
    // 1. Paimam užbaigtas pamainas (Pajamos)
    const { data: shifts } = await db.from('finance_shifts')
        .select('end_time, gross_earnings, vehicle_id')
        .eq('status', 'completed')
        .order('end_time', {ascending: false})
        .limit(5);

    // 2. Paimam išlaidas (Expenses)
    const { data: expenses } = await db.from('expenses')
        .select('created_at, amount, type')
        .order('created_at', {ascending: false})
        .limit(5);

    // 3. Sujungiame į vieną sąrašą
    let history = [];
    
    if (shifts) {
        shifts.forEach(s => {
            history.push({
                date: new Date(s.end_time),
                amount: s.gross_earnings,
                type: 'SHIFT',
                is_income: true
            });
        });
    }

    if (expenses) {
        expenses.forEach(e => {
            history.push({
                date: new Date(e.created_at),
                amount: e.amount,
                type: e.type.toUpperCase(),
                is_income: false
            });
        });
    }

    // 4. Surūšiuojame pagal laiką (naujausi viršuje)
    history.sort((a, b) => b.date - a.date);
    history = history.slice(0, 50); // Rodyti max 50 įrašų

    // 5. Atvaizduojame
    const el = document.getElementById('audit-list');
    if(!el) return;
    
    if(history.length > 0) {
        el.innerHTML = history.map(item => {
            return `
            <div class="bento-card flex-row justify-between items-center p-3 mb-2 animate-slideUp">
                <div>
                    <p class="text-[9px] text-gray-500 font-bold uppercase">${item.date.toLocaleDateString()} ${item.date.getHours()}:${String(item.date.getMinutes()).padStart(2, '0')}</p>
                    <p class="font-bold text-xs text-white uppercase">${item.type}</p>
                </div>
                <p class="font-mono font-bold ${item.is_income ? 'text-green-500' : 'text-red-500'}">
                    ${item.is_income ? '+' : '-'}$${item.amount}
                </p>
            </div>`;
        }).join('');
    } else {
        el.innerHTML = '<div class="text-center py-4 opacity-50 text-xs">NO HISTORY</div>';
    }
}

// --- GARAGE (VEIKIA SU 1.0 SQL) ---
function openGarage() {
    vibrate();
    document.getElementById('veh-name').value = '';
    document.getElementById('veh-cost').value = '';
    setVehType('rental'); 
    document.getElementById('garage-modal').classList.remove('hidden');
}

function setVehType(type) {
    vibrate();
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
    vibrate([20]);
    const name = document.getElementById('veh-name').value;
    const cost = document.getElementById('veh-cost').value;
    const type = document.getElementById('veh-type').value;

    if (!name) return showToast('Reikia pavadinimo', 'error');

    state.loading = true;
    try {
        // GRĮŽTAME PRIE 1.0 SQL STRUKTŪROS
        const { error } = await db.from('vehicles').insert({
            user_id: state.user.id,
            name: name,
            type: type,
            operating_cost_weekly: parseFloat(cost || 0),
            is_active: true
        });
        
        if (error) throw error;
        showToast('Mašina pridėta!', 'success');
        closeModals();
        await fetchFleet(); 
    } catch (e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- SHIFT LOGIC (1.0 SQL) ---
function openStartModal() {
    vibrate();
    const sel = document.getElementById('start-vehicle');
    if(state.fleet.length === 0) {
        sel.innerHTML = '<option value="">Garažas tuščias!</option>';
    } else {
        sel.innerHTML = state.fleet.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    }
    document.getElementById('start-modal').classList.remove('hidden');
}

async function confirmStart() {
    vibrate([20]);
    const vid = document.getElementById('start-vehicle').value;
    const odo = document.getElementById('start-odo').value;
    
    if(!vid) return showToast('Pasirink mašiną', 'error');
    if(!odo) return showToast('Įvesk ridą', 'error');
    
    state.loading = true;
    try {
        // 1.0 SQL naudoja 'start_odo'
        await db.from('finance_shifts').insert({
            user_id: state.user.id,
            vehicle_id: vid,
            start_odo: parseInt(odo), 
            status: 'active'
        });
        closeModals();
        await refreshAll();
        showToast('Pamaina pradėta', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

async function togglePause() {
    vibrate();
    if(!state.activeShift) return;
    showToast('Pause funkcija ruošiama', 'info'); 
}

function openEndModal() { 
    vibrate();
    document.getElementById('end-modal').classList.remove('hidden'); 
}

async function confirmEnd() {
    vibrate([20]);
    const odo = document.getElementById('end-odo').value;
    const earn = document.getElementById('end-earn').value;
    
    if(!odo) return showToast('Įvesk ridą ir pajamas', 'error');
    
    state.loading = true;
    try {
        // 1.0 SQL naudoja 'end_odo' ir 'gross_earnings'
        const { error } = await db.from('finance_shifts').update({
            end_odo: parseInt(odo), 
            gross_earnings: parseFloat(earn || 0),
            end_time: new Date().toISOString(), 
            status: 'completed'
        }).eq('id', state.activeShift.id);
        
        if(error) throw error;

        closeModals(); await refreshAll(); showToast('Pamaina baigta', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- TRANSACTIONS (GRĮŽTAME PRIE 'expenses') ---
function openTxModal(dir) {
    vibrate();
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Pajamos' : 'Išlaidos';
    document.getElementById('tx-amount').value = '';
    
    // UI: Rodyti kuro laukus tik jei tai Išlaidos
    const isExp = dir === 'out';
    document.getElementById('expense-types').classList.toggle('hidden', !isExp);
    document.getElementById('fuel-fields').classList.add('hidden');
    
    document.getElementById('tx-modal').classList.remove('hidden');
}

function setExpType(type) {
    vibrate();
    document.getElementById('tx-type').value = type;
    document.getElementById('fuel-fields').classList.toggle('hidden', type !== 'fuel');
    document.querySelectorAll('.exp-btn').forEach(b => b.classList.remove('bg-teal-500', 'text-black'));
    event.target.classList.add('bg-teal-500', 'text-black');
}

async function confirmTx() {
    vibrate([20]);
    const amt = parseFloat(document.getElementById('tx-amount').value);
    if(!amt) return;
    
    state.loading = true;
    try {
        if(state.txDirection === 'out') {
            // IŠLAIDOS: Rašome į 'expenses' lentelę (1.0 SQL)
            const type = document.getElementById('tx-type').value;
            const gal = document.getElementById('tx-gal').value;
            const odo = document.getElementById('tx-odo').value;
            
            // Validacija kurui
            if(type === 'fuel' && (!gal || !odo)) throw new Error('Kurui reikia Litrų ir Ridos');
            
            await db.from('expenses').insert({
                user_id: state.user.id,
                shift_id: state.activeShift?.id || null,
                vehicle_id: state.activeShift?.vehicle_id || null,
                type: type,
                amount: amt,
                gallons: gal ? parseFloat(gal) : null,
                odometer: odo ? parseInt(odo) : null
            });
            
            showToast('Išlaida įrašyta', 'success');
        } else {
            // PAJAMOS: 1.0 Konstitucija sako, kad pajamos vedamos tik gale.
            // Bet jei nori, galime tiesiog rodyti pranešimą.
            showToast('Pajamos vedamos uždarant pamainą', 'info');
            state.loading = false;
            return; 
        }

        closeModals(); 
        await refreshAll(); 
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- EXPORT ---
async function exportAI() {
    vibrate();
    state.loading = true;
    try {
        const { data: report } = await db.rpc('get_empire_report', { target_user_id: state.user.id });
        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        showToast('Nukopijuota į Clipboard!', 'success');
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
    const target = Math.round(state.dailyCost) || 1; 
    const current = state.shiftEarnings || 0; 
    document.getElementById('grind-val').textContent = `$${current} / $${target}`;
    const pct = Math.min((current / target) * 100, 100);
    document.getElementById('grind-bar').style.width = `${pct}%`;
    if(pct >= 100) document.getElementById('grind-glow').classList.remove('hidden');
}
function closeModals() { 
    vibrate();
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden')); 
}
function showToast(msg, type='info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    const color = type === 'error' ? 'bg-red-500' : 'bg-teal-500';
    t.className = `${color} text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-bold animate-slideUp`;
    t.innerHTML = `<i class="fa-solid fa-${type==='error'?'triangle-exclamation':'check'}"></i> <span>${msg}</span>`;
    c.appendChild(t);
    vibrate(type === 'error' ? [50, 50, 50] : [20]);
    setTimeout(() => t.remove(), 3000);
}
function switchTab(id) {
    vibrate();
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
        
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        document.getElementById('shift-timer').textContent = `${h}:${m}:${s}`;
    }, 1000);
}
function stopTimer() { clearInterval(timerInt); document.getElementById('shift-timer').textContent = "00:00:00"; }
function setupRealtime() { db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe(); }
async function login() {
    vibrate();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    const { error } = await db.auth.signInWithPassword({email, password});
    if(error) showToast(error.message, 'error'); else location.reload();
}
async function logout() { vibrate(); await db.auth.signOut(); location.reload(); }
function toggleTheme() { vibrate(); document.documentElement.classList.toggle('light'); }
document.addEventListener('DOMContentLoaded', init);
