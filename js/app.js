/* ROBERT ❤️ OS v5.1.3 - ENGINE */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const getEl = (id) => document.getElementById(id);
let activeShiftId = null, shiftStartTime = null, timerInterval = null, txMode = 'in';

async function init() {
    getEl('auto-year').innerText = new Date().getFullYear();
    initTheme();

    const { data: { session } } = await db.auth.getSession();
    if (session) {
        getEl('auth-screen').classList.add('hidden');
        getEl('app-content').classList.remove('hidden');
        await checkActiveShift();
        await switchTab('cockpit');
    } else {
        getEl('auth-screen').classList.remove('hidden');
        getEl('app-content').classList.add('hidden');
    }
}

async function login() {
    const { error } = await db.auth.signInWithPassword({ 
        email: getEl('auth-email').value, 
        password: getEl('auth-pass').value 
    });
    if (error) alert("Klaida: " + error.message); else location.reload();
}

async function logout() { await db.auth.signOut(); localStorage.clear(); location.reload(); }

async function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    getEl(`tab-${id}`).classList.add('active');
    getEl(`btn-${id}`).classList.add('active');
    
    // Kontekstinis krovimas
    if (id === 'cockpit') await refreshCockpit();
    if (id === 'runway') await refreshRunway();
    if (id === 'projection') await refreshProjection();
    if (id === 'vault') await refreshVault();
    if (id === 'audit') await refreshAudit();
}

async function refreshCockpit() {
    const { data } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (data) {
        const pct = data.buffer_pct;
        getEl('buffer-val').innerText = `${pct}%`;
        const bar = getEl('buffer-bar');
        bar.style.width = `${pct}%`;
        bar.style.backgroundColor = pct > 80 ? '#22c55e' : (pct > 40 ? '#f59e0b' : '#ef4444');
    }
}

async function refreshRunway() {
    const { data } = await db.from('runway_view').select('*').maybeSingle();
    if (data) getEl('runway-val').innerText = data.runway_months || '0.0';
}

async function refreshProjection() {
    const { data: nw } = await db.from('total_net_worth_view').select('total_net_worth').maybeSingle();
    const { data: goals } = await db.from('goal_projection_view').select('*');
    const container = getEl('eta-container');
    container.innerHTML = `<div class="glass-card p-10 text-center mb-6"><p class="label-tiny">Total Wealth</p><p class="text-4xl font-black">$${parseFloat(nw?.total_net_worth || 0).toLocaleString()}</p></div>`;
    if (goals) container.innerHTML += goals.map(g => `<div class="glass-card p-6 flex justify-between items-center mb-3"><div><p class="label-tiny">Goal</p><p class="font-bold">$${(g.target_net_worth/1000).toFixed(0)}K</p></div><div class="text-right"><p class="text-2xl font-black text-primary-500">${g.months_to_goal ? (g.months_to_goal/12).toFixed(1)+' m.' : 'STALL'}</p></div></div>`).join('');
}

async function refreshVault() {
    const { data } = await db.from('investment_portfolio_view').select('*');
    if (data) getEl('asset-list').innerHTML = data.map(a => `<div class="glass-card p-5 flex justify-between items-center mb-3"><span class="font-bold uppercase text-xs tracking-widest">${a.symbol}</span><span class="font-black text-primary-500 text-lg">$${parseFloat(a.market_value).toLocaleString()}</span></div>`).join('');
}

async function refreshAudit() {
    const { data } = await db.from('finance_transactions').select('*').order('date',{ascending:false}).limit(15);
    if (data) getEl('audit-list').innerHTML = data.map(t => `<div class="glass-card p-4 flex justify-between text-[10px] font-bold mb-2"><span class="opacity-40 uppercase">${new Date(t.date).toLocaleDateString()}</span><span class="${t.direction==='in'?'text-primary-500':'text-red-400'} uppercase">$${t.amount.toLocaleString()}</span></div>`).join('');
}

// Modals & Actions
function toggleSettings() { getEl('settings-modal').classList.toggle('hidden'); }
function openOdoModal() { getEl('odo-title').innerText = activeShiftId ? "End Miles" : "Start Miles"; getEl('odo-modal').classList.remove('hidden'); }
function closeModals() { document.querySelectorAll('.fixed.inset-0').forEach(m => { if(m.id !== 'auth-screen') m.classList.add('hidden'); }); }

async function confirmShiftAction() {
    const odo = getEl('odo-input').value; if (!odo) return;
    if (!activeShiftId) await db.from('finance_shifts').insert([{start_odometer: odo, status:'active'}]);
    else await db.from('finance_shifts').update({end_odometer: odo, status:'completed', end_time: new Date()}).eq('id', activeShiftId);
    closeModals(); await checkActiveShift(); await refreshCockpit();
}

async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = getEl('shift-btn');
    if (data) {
        activeShiftId = data.id; shiftStartTime = new Date(data.start_time);
        btn.innerText = "End Shift"; btn.classList.replace('bg-primary-500', 'bg-red-500');
        startTimer();
    } else {
        activeShiftId = null; btn.innerText = "Start Shift"; btn.classList.replace('bg-red-500', 'bg-primary-500');
        if (timerInterval) clearInterval(timerInterval); getEl('shift-timer').innerText = "00:00:00";
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0'), m = String(Math.floor((diff%3600)/60)).padStart(2,'0'), s = String(diff%60).padStart(2,'0');
        getEl('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function openTx(m) { txMode = m; getEl('tx-modal').classList.remove('hidden'); }
async function saveTx() {
    const amount = getEl('tx-amount').value; if (!amount) return;
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert([{amount, direction: txMode, asset_id: asset.id, source:'shift', shift_id: activeShiftId}]);
    closeModals(); await refreshCockpit();
}

function setTheme(m) {
    document.documentElement.classList.toggle('dark', m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
    localStorage.theme = m;
}
function initTheme() { setTheme(localStorage.theme || 'system'); }

window.addEventListener('DOMContentLoaded', init);
