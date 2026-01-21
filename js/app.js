/* ROBERT ❤️ OS v6.0.3 - PRODUCTION ENGINE */

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

    switch(tabId) {
        case 'cockpit': await refreshCockpit(); break;
        case 'runway': await refreshRunway(); break;
        case 'projection': await refreshProjection(); break;
        case 'vault': await refreshVault(); break;
        case 'audit': await refreshAudit(); break;
    }
}

async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = $('shift-btn');
    if (data) {
        state.activeShiftId = data.id;
        state.shiftStartTime = new Date(data.start_time);
        btn.innerText = "End Shift";
        btn.style.background = "#ef4444";
        startTimer();
    } else {
        state.activeShiftId = null;
        btn.innerText = "Start Shift";
        btn.style.background = "var(--p)";
        if (state.timerInterval) clearInterval(state.timerInterval);
        $('shift-timer').innerText = "00:00:00";
    }
}

function openOdoModal() {
    $('odo-title').innerText = state.activeShiftId ? "Pabaigos Miles" : "Starto Miles";
    $('odo-modal').classList.remove('hidden');
}

async function confirmShiftAction() {
    const odo = parseInt($('odo-input').value);
    if (isNaN(odo) || odo < 0) return alert("Įveskite ridą");

    if (!state.activeShiftId) {
        await db.from('finance_shifts').insert([{start_odometer: odo, status: 'active', user_id: state.user.id}]);
    } else {
        await db.from('finance_shifts').update({end_odometer: odo, status: 'completed', end_time: new Date()}).eq('id', state.activeShiftId);
    }
    
    closeModals();
    await checkActiveShift();
    await refreshCockpit();
}

// ... Kitos refresh funkcijos (refreshCockpit, refreshRunway) lieka tokios pačios kaip v6.0.2 ...

function startTimer() {
    state.timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - state.shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0'), m = String(Math.floor((diff%3600)/60)).padStart(2,'0'), s = String(diff%60).padStart(2,'0');
        $('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function closeModals() {
    document.querySelectorAll('.fixed.inset-0').forEach(m => {
        if (m.id !== 'auth-screen') m.classList.add('hidden');
    });
}

window.addEventListener('DOMContentLoaded', init);
