/* ROBERT ❤️ OS v6.0.1 - HARDENED ENGINE */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
let state = { activeShiftId: null, shiftStartTime: null, timerInterval: null, txMode: 'in', user: null };

async function init() {
    const yearEl = $('auto-year');
    if (yearEl) yearEl.innerText = new Date().getFullYear();
    
    initTheme();

    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        $('auth-screen').classList.add('hidden');
        $('app-content').classList.remove('hidden');
        await checkActiveShift();
        await switchTab('cockpit');
    } else {
        $('auth-screen').classList.remove('hidden');
    }
}

async function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if ($(tabId)) $(tabId).classList.add('active'); // Šis pataisymas užtikrina tabų veikimą
    if ($(`tab-${tabId}`)) $(`tab-${tabId}`).classList.add('active');
    if ($(`btn-${tabId}`)) $(`btn-${tabId}`).classList.add('active');

    switch(tabId) {
        case 'cockpit': await refreshCockpit(); break;
        case 'runway': await refreshRunway(); break;
        case 'projection': await refreshProjection(); break;
        case 'vault': await refreshVault(); break;
        case 'audit': await refreshAudit(); break;
    }
}

async function refreshCockpit() {
    const { data } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (data) {
        const bar = $('buffer-bar');
        if (bar) {
            bar.style.width = `${data.buffer_pct}%`;
            bar.style.backgroundColor = data.buffer_pct > 80 ? '#14b8a6' : (data.buffer_pct > 40 ? '#f59e0b' : '#ef4444');
        }
    }
}

async function refreshRunway() {
    const { data: rw } = await db.from('runway_view').select('*').maybeSingle();
    const { data: buf } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (rw) {
        $('runway-val').innerText = rw.runway_months || '0.0';
        $('stat-liquid').innerText = `$${Math.round(rw.liquid_cash).toLocaleString()}`;
        $('stat-burn').innerText = `$${Math.round(rw.monthly_burn).toLocaleString()}`;
        $('stat-safety').innerText = `${buf?.buffer_pct || 0}%`;
    }
}

async function refreshProjection() {
    const { data: nw } = await db.from('total_net_worth_view').select('total_net_worth').maybeSingle();
    const { data: goals } = await db.from('goal_projection_view').select('*');
    const container = $('eta-container');
    container.innerHTML = `<div class="glass-card text-center py-8"><p class="label-tiny">Total Net Worth</p><p class="text-4xl font-black">$${parseFloat(nw?.total_net_worth || 0).toLocaleString()}</p></div>`;
    if (goals) {
        container.innerHTML += goals.map(g => `
            <div class="glass-card flex justify-between items-center">
                <div class="text-left"><p class="label-tiny">Target</p><p class="font-bold">$${(g.target_net_worth/1000).toFixed(0)}K</p></div>
                <div class="text-right"><p class="text-2xl font-black text-teal-500">${g.months_to_goal ? (g.months_to_goal/12).toFixed(1)+' y.' : 'STALL'}</p></div>
            </div>`).join('');
    }
}

async function refreshVault() {
    const { data } = await db.from('investment_portfolio_view').select('*');
    if (data) {
        $('asset-list').innerHTML = data.map(a => `
            <div class="glass-card flex justify-between items-center">
                <div class="text-left"><p class="label-tiny">${a.symbol}</p><p class="font-bold text-lg">${parseFloat(a.quantity).toLocaleString()}</p></div>
                <p class="font-black text-teal-500 text-xl">$${parseFloat(a.market_value).toLocaleString()}</p>
            </div>`).join('');
    }
}

async function refreshAudit() {
    const { data } = await db.from('finance_transactions').select('*').order('date', {ascending: false}).limit(15);
    if (data) {
        $('audit-list').innerHTML = data.map(t => `
            <div class="glass-card p-4 flex justify-between items-center">
                <div class="text-left"><p class="label-tiny">${new Date(t.date).toLocaleDateString()}</p><p class="font-bold text-xs opacity-50 uppercase">${t.source}</p></div>
                <p class="font-black ${t.direction === 'in' ? 'text-teal-500' : 'text-red-400'} text-lg">${t.direction === 'in' ? '+' : '-'}$${t.amount.toLocaleString()}</p>
            </div>`).join('');
    }
}

// --- VEIKSMAI ---
function openOdoModal() {
    $('odo-title').innerText = state.activeShiftId ? "Pabaigos Miles" : "Starto Miles";
    $('odo-input').value = "";
    $('odo-modal').classList.remove('hidden');
}

async function confirmShiftAction() {
    const rawOdo = $('odo-input').value;
    const odo = parseInt(rawOdo);
    if (rawOdo === '' || isNaN(odo) || odo < 0) return alert("Įveskite ridą");

    if (!state.activeShiftId) {
        await db.from('finance_shifts').insert([{start_odometer: odo, status: 'active', user_id: state.user.id}]);
    } else {
        await db.from('finance_shifts').update({end_odometer: odo, status: 'completed', end_time: new Date()}).eq('id', state.activeShiftId);
    }
    closeModals(); await checkActiveShift(); await refreshCockpit();
}

async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = $('shift-btn');
    if (data) {
        state.activeShiftId = data.id; state.shiftStartTime = new Date(data.start_time);
        btn.innerText = "End Shift"; btn.style.background = "#ef4444"; btn.style.color = "white";
        startTimer();
    } else {
        state.activeShiftId = null; btn.innerText = "Start Shift"; btn.style.background = "white"; btn.style.color = "#0d9488";
        if (state.timerInterval) clearInterval(state.timerInterval); $('shift-timer').innerText = "00:00:00";
    }
}

function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - state.shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0'), m = String(Math.floor((diff%3600)/60)).padStart(2,'0'), s = String(diff%60).padStart(2,'0');
        $('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function openTx(m) { state.txMode = m; $('tx-modal').classList.remove('hidden'); }
function closeModals() { document.querySelectorAll('.fixed.inset-0').forEach(m => { if(m.id !== 'auth-screen') m.classList.add('hidden'); }); }
async function saveTx() {
    const amount = $('tx-amount').value; if (!amount) return;
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert([{amount, direction: state.txMode, asset_id: asset.id, source: 'shift', shift_id: state.activeShiftId, user_id: state.user.id}]);
    closeModals(); await refreshCockpit();
}

async function login() {
    const email = $('auth-email').value, pass = $('auth-pass').value;
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) alert(error.message); else location.reload();
}
async function logout() { await db.auth.signOut(); localStorage.clear(); location.reload(); }
function toggleSettings() { $('settings-modal').classList.toggle('hidden'); }
function initTheme() { document.documentElement.classList.toggle('dark', localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)); }
function setTheme(m) { localStorage.theme = m; initTheme(); closeModals(); }

window.addEventListener('DOMContentLoaded', init);
