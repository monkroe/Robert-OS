/* ROBERT ❤️ OS v6.0.3 - LOGIC CORE */

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

async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = $('shift-btn');
    const label = $('active-vehicle-label');

    if (data) {
        state.activeShiftId = data.id;
        state.shiftStartTime = new Date(data.start_time);
        btn.innerText = "End Shift"; btn.style.background = "#ef4444";
        if (label) label.innerText = `Vairuojate: ${data.vehicle_name || 'Auto'}`;
        startTimer();
    } else {
        state.activeShiftId = null;
        btn.innerText = "Start Shift"; btn.style.background = "var(--p)";
        if (label) label.innerText = "Avarinė atsarga";
        if (state.timerInterval) clearInterval(state.timerInterval);
        $('shift-timer').innerText = "00:00:00";
    }
}

async function openOdoModal() {
    const modal = $('odo-modal');
    const vGroup = $('vehicle-selection-group');
    const select = $('vehicle-select');

    if (state.activeShiftId) {
        vGroup.classList.add('hidden');
        $('odo-title').innerText = "Pabaigos Miles";
    } else {
        vGroup.classList.remove('hidden');
        $('odo-title').innerText = "Starto Miles";
        const { data: vehicles } = await db.from('vehicles').select('*');
        if (vehicles) select.innerHTML = vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    }
    modal.classList.remove('hidden');
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
    closeModals(); await checkActiveShift(); await refreshCockpit();
}

// ... Kitos funkcijos ...
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

async function saveTx() {
    const amount = parseFloat($('tx-amount').value); if (!amount) return;
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert([{amount, direction: state.txMode, asset_id: asset.id, source:'shift', shift_id: state.activeShiftId, user_id: state.user.id}]);
    await db.rpc('increment_asset_balance', { asset_uuid: asset.id, delta: (state.txMode=='in'?amount:-amount) });
    closeModals(); await refreshCockpit();
}

function startTimer() { if (state.timerInterval) clearInterval(state.timerInterval); state.timerInterval = setInterval(() => { const diff = Math.floor((new Date() - state.shiftStartTime) / 1000); const h = String(Math.floor(diff/3600)).padStart(2,'0'), m = String(Math.floor((diff%3600)/60)).padStart(2,'0'), s = String(diff%60).padStart(2,'0'); $('shift-timer').innerText = `${h}:${m}:${s}`; }, 1000); }
function openTx(m) { state.txMode = m; $('tx-modal').classList.remove('hidden'); }
function logout() { db.auth.signOut(); location.reload(); }
function initTheme() { document.documentElement.classList.toggle('dark', localStorage.theme === 'dark'); }
function closeModals() { ['odo-modal','tx-modal'].forEach(id => $(id).classList.add('hidden')); }
window.addEventListener('DOMContentLoaded', init);
