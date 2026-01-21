/* ROBERT ❤️ OS v5.3.1 - READABLE ENGINE */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const getEl = (id) => document.getElementById(id);

let activeShiftId = null;
let shiftStartTime = null;
let timerInterval = null;
let txMode = 'in';

/**
 * Pradinis sistemos užkrovimas
 */
async function init() {
    // Sutvarkome metus apačioje
    if (getEl('auto-year')) {
        getEl('auto-year').innerText = new Date().getFullYear();
    }

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

/**
 * Tabų valdymas - išskaidytas aiškumui
 */
async function switchTab(tabId) {
    // 1. Išvalome senus aktyvius elementus
    const allTabs = document.querySelectorAll('.tab-content');
    const allNavs = document.querySelectorAll('.nav-item');
    
    allTabs.forEach(t => t.classList.remove('active'));
    allNavs.forEach(n => n.classList.remove('active'));
    
    // 2. Aktyvuojame naujus
    const targetTab = getEl(`tab-${tabId}`);
    const targetNav = getEl(`btn-${tabId}`);
    
    if (targetTab && targetNav) {
        targetTab.classList.add('active');
        targetNav.classList.add('active');
    }

    // 3. Krauname duomenis pagal kontekstą
    switch (tabId) {
        case 'cockpit': 
            await refreshCockpit(); 
            break;
        case 'runway': 
            await refreshRunway(); 
            break;
        case 'projection': 
            await refreshProjection(); 
            break;
        case 'vault': 
            await refreshVault(); 
            break;
        case 'audit': 
            await refreshAudit(); 
            break;
    }
}

/**
 * Runway duomenų atnaujinimas
 */
async function refreshRunway() {
    const { data: rw } = await db.from('runway_view')
        .select('*')
        .maybeSingle();

    const { data: buf } = await db.from('emergency_buffer_view')
        .select('buffer_pct')
        .maybeSingle();

    if (rw) {
        getEl('runway-val').innerText = rw.runway_months || '0.0';
        getEl('stat-liquid').innerText = `$${Math.round(rw.liquid_cash).toLocaleString()}`;
        getEl('stat-burn').innerText = `$${Math.round(rw.monthly_burn).toLocaleString()}`;
        getEl('stat-safety').innerText = `${buf?.buffer_pct || 0}%`;
    }
}

/**
 * Pamainos būsenos patikra
 */
async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view')
        .select('*')
        .maybeSingle();

    const btn = getEl('shift-btn');
    
    if (data) {
        activeShiftId = data.id;
        shiftStartTime = new Date(data.start_time);
        
        btn.innerText = "End Shift";
        btn.style.background = "#ef4444";
        startTimer();
    } else {
        activeShiftId = null;
        btn.innerText = "Start Shift";
        btn.style.background = "var(--p)";
        
        if (timerInterval) clearInterval(timerInterval);
        getEl('shift-timer').innerText = "00:00:00";
    }
}

/**
 * Laikmačio paleidimas
 */
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - shiftStartTime) / 1000);
        
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        
        getEl('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

// --- PAGALBINĖS FUNKCIJOS ---

function toggleSettings() {
    getEl('settings-modal').classList.toggle('hidden');
}

function closeModals() {
    const modals = document.querySelectorAll('.fixed.inset-0');
    modals.forEach(m => {
        if (m.id !== 'auth-screen') m.classList.add('hidden');
    });
}

async function logout() {
    await db.auth.signOut();
    localStorage.clear();
    location.reload();
}

window.addEventListener('DOMContentLoaded', init);
