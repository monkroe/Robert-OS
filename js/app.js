/* ROBERT ❤️ OS v5.2.0 - AESTHETIC SYNC */

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
    }
}

async function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    getEl(`tab-${id}`).classList.add('active');
    getEl(`btn-${id}`).classList.add('active');
    
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
        const bar = getEl('buffer-bar');
        bar.style.width = `${pct}%`;
        bar.style.backgroundColor = pct > 80 ? '#22c55e' : (pct > 40 ? '#f59e0b' : '#ef4444');
    }
}

async function refreshRunway() {
    const { data: rw } = await db.from('runway_view').select('*').maybeSingle();
    const { data: buf } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (rw) {
        getEl('runway-val').innerText = rw.runway_months || '0.0';
        getEl('stat-liquid').innerText = `$${Math.round(rw.liquid_cash)}`;
        getEl('stat-burn').innerText = `$${Math.round(rw.monthly_burn)}`;
        getEl('stat-safety').innerText = `${buf?.buffer_pct || 0}%`;
    }
}

async function refreshProjection() {
    const { data: nw } = await db.from('total_net_worth_view').select('total_net_worth').maybeSingle();
    const { data: goals } = await db.from('goal_projection_view').select('*');
    getEl('nw-val').innerText = `$${parseFloat(nw?.total_net_worth || 0).toLocaleString()}`;
    const container = getEl('eta-container');
    if (goals) {
        container.innerHTML = goals.map(g => `
            <div class="glass-card p-6 flex justify-between items-center mb-3">
                <div class="text-left"><p class="label-tiny" style="text-align:left">${g.asset_symbol || 'Net Worth'} Goal</p><p class="font-bold text-lg">$${(g.target_net_worth/1000).toFixed(0)}K</p></div>
                <div class="text-right"><p class="text-2xl font-black text-primary-500">${g.months_to_goal ? (g.months_to_goal/12).toFixed(1)+' y.' : 'STALL'}</p></div>
            </div>
        `).join('');
    }
}

async function refreshVault() {
    const { data } = await db.from('investment_portfolio_view').select('*');
    if (data) getEl('asset-list').innerHTML = data.map(a => `<div class="glass-card p-6 flex justify-between items-center mb-3"><div><p class="label-tiny" style="text-align:left">${a.symbol}</p><p class="font-bold text-lg">${parseFloat(a.quantity).toLocaleString()}</p></div><div class="text-right"><p class="font-black text-primary-500 text-xl">$${parseFloat(a.market_value).toLocaleString()}</p></div></div>`).join('');
}

async function refreshAudit() {
    const { data } = await db.from('finance_transactions').select('*').order('date',{ascending:false}).limit(15);
    if (data) getEl('audit-list').innerHTML = data.map(t => `<div class="glass-card p-5 flex justify-between items-center mb-2"><div class="text-left"><p class="label-tiny" style="text-align:left">${new Date(t.date).toLocaleDateString()}</p><p class="font-bold text-xs uppercase">${t.source}</p></div><p class="font-black ${t.direction==='in'?'text-primary-500':'text-red-400'} text-lg">${t.direction==='in'?'+':'-'}$${t.amount.toLocaleString()}</p></div>`).join('');
}

// --- Auth & Theme ---
async function login() {
    const { error } = await db.auth.signInWithPassword({ email: getEl('auth-email').value, password: getEl('auth-pass').value });
    if (error) alert(error.message); else location.reload();
}
async function logout() { await db.auth.signOut(); localStorage.clear(); location.reload(); }
function toggleSettings() { getEl('settings-modal').classList.toggle('hidden'); }
function closeModals() { document.querySelectorAll('.fixed.inset-0').forEach(m => { if(m.id !== 'auth-screen') m.classList.add('hidden'); }); }
function initTheme() { document.documentElement.classList.toggle('dark', localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)); }
function setTheme(m) { if(m==='system') localStorage.removeItem('theme'); else localStorage.theme = m; initTheme(); }

// --- Actions ---
function openOdoModal() { getEl('odo-title').innerText = activeShiftId ? "End Miles" : "Start Miles"; getEl('odo-input').value = ""; getEl('odo-modal').classList.remove('hidden'); }
async function confirmShiftAction() {
    const odo = getEl('odo-input').value; if (!odo) return;
    if (!activeShiftId) await db.from('finance_shifts').insert([{start_odometer: odo, status:'active'}]);
    else await db.from('finance_shifts').update({end_odometer: odo, status:'completed', end_time: new Date()}).eq('id', activeShiftId);
    closeModals(); await checkActiveShift(); await refreshCockpit();
}
async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = getEl('shift-btn');
    if (data) { activeShiftId = data.id; shiftStartTime = new Date(data.start_time); btn.innerText = "End Shift"; btn.style.background = "#ef4444"; startTimer(); }
    else { activeShiftId = null; btn.innerText = "Start Shift"; btn.style.background = "var(--p)"; if (timerInterval) clearInterval(timerInterval); getEl('shift-timer').innerText = "00:00:00"; }
}
function startTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = setInterval(() => { const diff = Math.floor((new Date() - shiftStartTime) / 1000); const h = String(Math.floor(diff/3600)).padStart(2,'0'), m = String(Math.floor((diff%3600)/60)).padStart(2,'0'), s = String(diff%60).padStart(2,'0'); getEl('shift-timer').innerText = `${h}:${m}:${s}`; }, 1000); }
function openTx(m) { txMode = m; getEl('tx-modal').classList.remove('hidden'); }
async function saveTx() {
    const amount = getEl('tx-amount').value; if (!amount) return;
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert([{amount, direction: txMode, asset_id: asset.id, source:'shift', shift_id: activeShiftId}]);
    closeModals(); await refreshCockpit();
}

window.addEventListener('DOMContentLoaded', init);
