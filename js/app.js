/* ROBERT ❤️ OS v6.1.2 - ENGINE */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
let state = { activeShiftId: null, shiftStartTime: null, timerInterval: null, txMode: 'in', user: null };

async function init() {
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
    
    if ($(`tab-${tabId}`)) $(`tab-${tabId}`).classList.add('active');
    if ($(`btn-${tabId}`)) $(`btn-${tabId}`).classList.add('active');

    if (tabId === 'cockpit') await refreshCockpit();
    if (tabId === 'runway') await refreshRunway();
    if (tabId === 'projection') await refreshProjection();
    if (tabId === 'vault') await refreshVault();
    if (tabId === 'audit') await refreshAudit();
}

async function refreshCockpit() {
    const { data } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (data && $('buffer-bar')) $('buffer-bar').style.width = `${data.buffer_pct}%`;
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
    const container = $('eta-container');
    if (nw) container.innerHTML = `<div class="glass-card text-center py-10"><p class="label-tiny">Net Worth</p><p class="display-value">$${parseFloat(nw.total_net_worth).toLocaleString()}</p></div>`;
}

async function refreshVault() {
    const { data } = await db.from('investment_portfolio_view').select('*');
    const container = $('asset-list');
    if (data) container.innerHTML = data.map(a => `
        <div class="glass-card flex justify-between items-center">
            <div><p class="label-tiny">${a.symbol}</p><p class="font-bold">${parseFloat(a.quantity).toLocaleString()}</p></div>
            <b class="text-teal-500">$${parseFloat(a.market_value).toLocaleString()}</b>
        </div>`).join('');
}

async function refreshAudit() {
    const { data } = await db.from('finance_transactions').select('*').order('date',{ascending:false}).limit(15);
    const container = $('audit-list');
    if (data) container.innerHTML = data.map(t => `
        <div class="glass-card p-4 flex justify-between items-center">
            <div class="text-left"><p class="label-tiny">${new Date(t.date).toLocaleDateString()}</p><p class="font-bold text-[10px] opacity-40 uppercase">${t.source}</p></div>
            <p class="font-black ${t.direction === 'in' ? 'text-teal-500' : 'text-red-400'} text-lg">${t.direction === 'in' ? '+' : '-'}$${t.amount.toLocaleString()}</p>
        </div>`).join('');
}

async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = $('shift-btn');
    const label = $('active-vehicle-label');

    if (data) {
        state.activeShiftId = data.id;
        state.shiftStartTime = new Date(data.start_time);
        btn.innerText = "End Shift"; btn.style.background = "#ef4444";
        if (label) label.innerText = `Auto: ${data.vehicle_name || 'Vairuojate'}`;
        startTimer();
    } else {
        state.activeShiftId = null;
        btn.innerText = "Start Shift"; btn.style.background = "var(--p)";
        if (label) label.innerText = "Safety Buffer";
        if (state.timerInterval) clearInterval(state.timerInterval);
        $('shift-timer').innerText = "00:00:00";
    }
}

async function openOdoModal() {
    const vGroup = $('vehicle-selection-group');
    const select = $('vehicle-select');
    if (state.activeShiftId) {
        vGroup.classList.add('hidden');
        $('odo-title').innerText = "Pabaigos Miles";
    } else {
        vGroup.classList.remove('hidden');
        $('odo-title').innerText = "Starto Miles";
        const { data: v } = await db.from('vehicles').select('*');
        if (v) select.innerHTML = v.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    }
    $('odo-modal').classList.remove('hidden');
}

async function confirmShiftAction() {
    const odo = parseInt($('odo-input').value);
    const vId = $('vehicle-select').value;
    if (isNaN(odo)) return alert("Įveskite ridą");
    if (!state.activeShiftId) {
        await db.from('finance_shifts').insert([{start_odometer: odo, vehicle_id: vId, status: 'active', user_id: state.user.id}]);
    } else {
        await db.from('finance_shifts').update({end_odometer: odo, status: 'completed', end_time: new Date()}).eq('id', state.activeShiftId);
    }
    closeModals(); await checkActiveShift();
}

function openTx(m) { state.txMode = m; const modal = document.createElement('div'); $('tx-modal').classList.remove('hidden'); }
async function saveTx() {
    const amount = parseFloat($('tx-amount').value); if (!amount) return;
    try {
        let { data: asset } = await db.from('finance_assets').select('id').eq('user_id', state.user.id).eq('is_liquid', true).order('cached_balance',{ascending:false}).limit(1).single();
        await db.from('finance_transactions').insert([{amount, direction: state.txMode, asset_id: asset.id, source:'shift', shift_id: state.activeShiftId, user_id: state.user.id}]);
        await db.rpc('increment_asset_balance', { asset_uuid: asset.id, delta: (state.txMode=='in'?amount:-amount) });
        closeModals(); await refreshCockpit();
    } catch(e) { console.error(e); }
}

function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        const diffInMs = new Date() - state.shiftStartTime;
        const diff = Math.floor(diffInMs / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0'), m = String(Math.floor((diff%3600)/60)).padStart(2,'0'), s = String(diff%60).padStart(2,'0');
        $('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function toggleSettings() { $('settings-modal').classList.toggle('hidden'); }
function closeModals() { ['odo-modal','tx-modal','settings-modal'].forEach(id => $(id).classList.add('hidden')); }
function setTheme(m) { localStorage.theme = m; initTheme(); closeModals(); }
function initTheme() { 
    const isDark = localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark); 
}
async function login() {
    const { error } = await db.auth.signInWithPassword({ email: $('auth-email').value, password: $('auth-pass').value });
    if (error) alert(error.message); else location.reload();
}
async function logout() { await db.auth.signOut(); location.reload(); }
window.addEventListener('DOMContentLoaded', init);
