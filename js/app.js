/* ROBERT ❤️ OS v5.1.1 - HARDENED LOGIC */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const getEl = (id) => document.getElementById(id);
let activeShiftId = null;
let shiftStartTime = null;
let timerInterval = null;
let txMode = 'in';

// --- INITIALIZE ---
async function init() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        getEl('app-content').classList.remove('hidden');
        await checkActiveShift();
        switchTab('cockpit'); // Pradedame nuo Cockpit
    }
}

// --- TAB SYSTEM (Optimized Fetching) ---
async function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    getEl(`tab-${id}`).classList.add('active');
    getEl(`btn-${id}`).classList.add('active');

    // Krauname TIK tai, ko reikia konkrečiam tabui
    switch(id) {
        case 'cockpit': await refreshCockpit(); break;
        case 'runway': await refreshRunway(); break;
        case 'projection': await refreshProjection(); break;
        case 'vault': await refreshVault(); break;
        case 'audit': await refreshAudit(); break;
    }
}

// --- CONTEXT-AWARE REFRESHES ---
async function refreshCockpit() {
    const { data: buffer } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (buffer) {
        const pct = buffer.buffer_pct;
        getEl('buffer-val').innerText = `${pct}%`;
        const bar = getEl('buffer-bar');
        bar.style.width = `${pct}%`;
        bar.style.backgroundColor = pct > 80 ? '#22c55e' : (pct > 40 ? '#f59e0b' : '#ef4444');
    }
}

async function refreshRunway() {
    const { data: rw } = await db.from('runway_view').select('*').maybeSingle();
    if (rw) {
        getEl('runway-val').innerText = rw.runway_months || '0.0';
        getEl('monthly-burn-info').innerText = `Burn Rate: $${rw.monthly_burn}/mėn.`;
    }
}

async function refreshProjection() {
    const { data: nw } = await db.from('total_net_worth_view').select('total_net_worth').maybeSingle();
    if (nw) getEl('nw-val').innerText = `$${parseFloat(nw.total_net_worth).toLocaleString()}`;
    const { data: goals } = await db.from('goal_projection_view').select('*');
    if (goals) {
        getEl('eta-container').innerHTML = goals.map(g => `
            <div class="glass-card p-6 flex justify-between items-center">
                <div><p class="label-tiny">Target</p><p class="font-black">$${(g.target_net_worth/1000).toFixed(0)}K</p></div>
                <div class="text-right"><p class="text-2xl font-black text-primary-500">${g.months_to_goal ? (g.months_to_goal/12).toFixed(1) + ' m.' : 'STALL'}</p></div>
            </div>
        `).join('');
    }
}

// --- SHIFT LOGIC (No prompts, no reloads) ---
function openOdoModal() {
    getEl('odo-title').innerText = activeShiftId ? "Pabaigos rida" : "Pradžios rida";
    getEl('odo-input').value = "";
    getEl('odo-modal').classList.remove('hidden');
}

function closeOdoModal() { getEl('odo-modal').classList.add('hidden'); }

async function confirmShiftAction() {
    const odo = getEl('odo-input').value;
    if (!odo) return alert("Įveskite ridą");
    
    if (!activeShiftId) {
        await db.from('finance_shifts').insert([{start_odometer: odo, status:'active'}]);
    } else {
        await db.from('finance_shifts').update({end_odometer: odo, status:'completed', end_time: new Date()}).eq('id', activeShiftId);
        activeShiftId = null;
        if (timerInterval) clearInterval(timerInterval);
        getEl('shift-timer').innerText = "00:00:00";
    }
    
    closeOdoModal();
    await checkActiveShift(); // Reaktyvus būsenos atnaujinimas
    await refreshCockpit();
}

async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = getEl('shift-btn');
    if (data) {
        activeShiftId = data.id;
        shiftStartTime = new Date(data.start_time);
        btn.innerText = "End Shift";
        btn.classList.replace('bg-primary-500', 'bg-red-500');
        startTimer();
    } else {
        btn.innerText = "Start Shift";
        btn.classList.replace('bg-red-500', 'bg-primary-500');
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        getEl('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

// --- TRANSACTIONS (Reactivity) ---
function openTx(mode) { txMode = mode; getEl('tx-modal').classList.remove('hidden'); }
function closeTxModal() { getEl('tx-modal').classList.add('hidden'); }

async function saveTx() {
    const amount = getEl('tx-amount').value;
    if (!amount) return;
    
    const confirmBtn = getEl('tx-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.innerText = "Saugoma...";

    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert([{amount, direction: txMode, asset_id: asset.id, source:'shift', shift_id: activeShiftId}]);
    
    closeTxModal();
    confirmBtn.disabled = false;
    confirmBtn.innerText = "Patvirtinti";
    await refreshCockpit(); // Atnaujiname buffer bar be puslapio perkrovimo
}

window.addEventListener('DOMContentLoaded', init);
