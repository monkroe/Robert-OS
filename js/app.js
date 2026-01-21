/* ROBERT ❤️ OS v5.3.0 - PREMIUM ENGINE */

const SUPABASE_URL = 'TAVO_URL';
const SUPABASE_KEY = 'TAVO_RAKTAS';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const getEl = (id) => document.getElementById(id);
let activeShiftId = null;
let shiftStartTime = null;
let timerInterval = null;
let txMode = 'in';

// --- INITIALIZE ---
async function init() {
    // Automatiniai metai footeryje
    const yearEl = getEl('auto-year');
    if (yearEl) yearEl.innerText = new Date().getFullYear();
    
    initTheme();

    const { data: { session } } = await db.auth.getSession();
    if (session) {
        getEl('auth-screen').classList.add('hidden');
        getEl('app-content').classList.remove('hidden');
        await checkActiveShift();
        await switchTab('cockpit'); // Startuojame Cockpit'e
    } else {
        getEl('auth-screen').classList.remove('hidden');
        getEl('app-content').classList.add('hidden');
    }
}

// --- TAB NAVIGATION (NO RELOAD) ---
async function switchTab(tabId) {
    // 1. Vizualus Tabų perjungimas
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    getEl(`tab-${tabId}`).classList.add('active');
    const navBtn = getEl(`btn-${tabId}`);
    if (navBtn) navBtn.classList.add('active');

    // 2. Kontekstinis duomenų krovimas (tik tam Tab'ui)
    switch(tabId) {
        case 'cockpit': await refreshCockpit(); break;
        case 'runway': await refreshRunway(); break;
        case 'projection': await refreshProjection(); break;
        case 'vault': await refreshVault(); break;
        case 'audit': await refreshAudit(); break;
    }
}

// --- 1. COCKPIT LOGIC ---
async function refreshCockpit() {
    const { data } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (data) {
        const pct = data.buffer_pct;
        const bar = getEl('buffer-bar');
        if (bar) {
            bar.style.width = `${pct}%`;
            bar.style.backgroundColor = pct > 80 ? '#22c55e' : (pct > 40 ? '#f59e0b' : '#ef4444');
        }
    }
}

// --- 2. RUNWAY LOGIC (Premium Stats) ---
async function refreshRunway() {
    const { data: rw } = await db.from('runway_view').select('*').maybeSingle();
    const { data: buf } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    
    if (rw) {
        getEl('runway-val').innerText = rw.runway_months || '0.0';
        getEl('stat-liquid').innerText = `$${Math.round(rw.liquid_cash).toLocaleString()}`;
        getEl('stat-burn').innerText = `$${Math.round(rw.monthly_burn).toLocaleString()}`;
        getEl('stat-safety').innerText = `${buf?.buffer_pct || 0}%`;
    }
}

// --- 3. PROJECTION LOGIC ---
async function refreshProjection() {
    const { data: nw } = await db.from('total_net_worth_view').select('total_net_worth').maybeSingle();
    const { data: goals } = await db.from('goal_projection_view').select('*');
    
    if (nw) getEl('nw-val').innerText = `$${parseFloat(nw.total_net_worth).toLocaleString()}`;
    
    const container = getEl('eta-container');
    if (goals && container) {
        container.innerHTML = goals.map(g => `
            <div class="glass-card p-6 flex justify-between items-center mb-3">
                <div class="text-left">
                    <p class="label-tiny" style="text-align:left">${g.asset_symbol || 'Net Worth'} Goal</p>
                    <p class="font-bold text-lg">$${(g.target_net_worth/1000).toFixed(0)}K</p>
                </div>
                <div class="text-right">
                    <p class="text-2xl font-black text-primary-500">${g.months_to_goal ? (g.months_to_goal/12).toFixed(1)+' y.' : 'STALL'}</p>
                </div>
            </div>
        `).join('');
    }
}

// --- 4. VAULT LOGIC ---
async function refreshVault() {
    const { data } = await db.from('investment_portfolio_view').select('*');
    const container = getEl('asset-list');
    if (data && container) {
        container.innerHTML = data.map(a => `
            <div class="glass-card p-6 flex justify-between items-center mb-3">
                <div class="text-left">
                    <p class="label-tiny" style="text-align:left">${a.symbol}</p>
                    <p class="font-bold text-lg">${parseFloat(a.quantity).toLocaleString()}</p>
                </div>
                <div class="text-right">
                    <p class="font-black text-primary-500 text-xl">$${parseFloat(a.market_value).toLocaleString()}</p>
                </div>
            </div>
        `).join('');
    }
}

// --- 5. AUDIT LOGIC ---
async function refreshAudit() {
    const { data } = await db.from('finance_transactions').select('*').order('date',{ascending:false}).limit(15);
    const container = getEl('audit-list');
    if (data && container) {
        container.innerHTML = data.map(t => `
            <div class="glass-card p-5 flex justify-between items-center mb-2">
                <div class="text-left">
                    <p class="label-tiny" style="text-align:left">${new Date(t.date).toLocaleDateString()}</p>
                    <p class="font-bold text-xs uppercase opacity-60">${t.source}</p>
                </div>
                <p class="font-black ${t.direction === 'in' ? 'text-primary-500' : 'text-red-400'} text-lg">
                    ${t.direction === 'in' ? '+' : '-'}$${t.amount.toLocaleString()}
                </p>
            </div>
        `).join('');
    }
}

// --- SHIFT CORE ACTIONS ---
async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    const btn = getEl('shift-btn');
    if (data) {
        activeShiftId = data.id;
        shiftStartTime = new Date(data.start_time);
        if (btn) {
            btn.innerText = "End Shift";
            btn.style.background = "#ef4444";
        }
        startTimer();
    } else {
        activeShiftId = null;
        if (btn) {
            btn.innerText = "Start Shift";
            btn.style.background = "var(--p)";
        }
        if (timerInterval) clearInterval(timerInterval);
        const timerDisplay = getEl('shift-timer');
        if (timerDisplay) timerDisplay.innerText = "00:00:00";
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        const timerDisplay = getEl('shift-timer');
        if (timerDisplay) timerDisplay.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

// Modalų valdymas
function openOdoModal() {
    getEl('odo-title').innerText = activeShiftId ? "End Shift Miles" : "Start Shift Miles";
    getEl('odo-input').value = "";
    getEl('odo-modal').classList.remove('hidden');
}

async function confirmShiftAction() {
    const odo = getEl('odo-input').value;
    if (!odo) return alert("Privaloma įvesti ridą");
    
    if (!activeShiftId) {
        await db.from('finance_shifts').insert([{start_odometer: odo, status:'active'}]);
    } else {
        await db.from('finance_shifts').update({end_odometer: odo, status:'completed', end_time: new Date()}).eq('id', activeShiftId);
    }
    
    closeModals();
    await checkActiveShift();
    await refreshCockpit();
}

// Transakcijos
function openTx(m) { 
    txMode = m; 
    getEl('tx-modal').classList.remove('hidden'); 
}

async function saveTx() {
    const amount = getEl('tx-amount').value;
    if (!amount) return;
    
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert([{
        amount, 
        direction: txMode, 
        asset_id: asset.id, 
        source: 'shift', 
        shift_id: activeShiftId
    }]);
    
    closeModals();
    await refreshCockpit();
    getEl('tx-amount').value = ""; // Išvalome lauką
}

// --- UTILS ---
function closeModals() {
    document.querySelectorAll('.fixed.inset-0').forEach(m => {
        if (m.id !== 'auth-screen') m.classList.add('hidden');
    });
}

async function login() {
    const email = getEl('auth-email').value;
    const password = getEl('auth-pass').value;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else location.reload();
}

async function logout() {
    await db.auth.signOut();
    localStorage.clear();
    location.reload();
}

function toggleSettings() { getEl('settings-modal').classList.toggle('hidden'); }

function initTheme() {
    const isDark = localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
}

function setTheme(m) {
    if (m === 'system') localStorage.removeItem('theme');
    else localStorage.theme = m;
    initTheme();
}

window.addEventListener('DOMContentLoaded', init);
