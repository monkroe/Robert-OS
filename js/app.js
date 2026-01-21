/* ROBERT OS v4.7.1 - STRATEGIC WEALTH OS */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const getEl = (id) => document.getElementById(id);
let activeShiftId = null;
let shiftStartTime = null;
let selectedWindow = 30;

// --- INITIALIZE ---
async function init() {
    initTheme();
    updateFooter();
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        getEl('auth-screen').classList.add('hidden');
        getEl('app-content').classList.remove('hidden');
        await loadAllData();
        await checkActiveShift();
    } else {
        getEl('auth-screen').classList.remove('hidden');
        getEl('app-content').classList.add('hidden');
    }
}

function updateFooter() {
    const yearEl = getEl('auto-year');
    if (yearEl) yearEl.innerText = new Date().getFullYear();
}

// --- WINDOWS MANAGEMENT ---
function setWindow(days) {
    selectedWindow = days;
    document.querySelectorAll('.window-btn').forEach(b => {
        b.classList.remove('bg-primary-500', 'text-black', 'border-primary-500');
        b.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
    });
    const activeBtn = getEl(`win-${days}`);
    activeBtn.classList.remove('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
    activeBtn.classList.add('bg-primary-500', 'text-black', 'border-primary-500');
    loadAllData();
}

async function loadAllData() {
    const { data: proj } = await db.from('goal_projection_view').select('*').maybeSingle();
    
    if (proj) {
        getEl('net-worth-display').innerText = `$${parseFloat(proj.current_nw).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
        const etaMonths = proj[`eta_${selectedWindow}d`];
        
        if (etaMonths && etaMonths > 0) {
            const years = (etaMonths / 12).toFixed(1);
            getEl('eta-display').innerText = `ETA: ${years} m. (pagal ${selectedWindow}D tempą)`;
            getEl('eta-display').classList.remove('bg-orange-500/10', 'text-orange-500');
        } else {
            getEl('eta-display').innerText = `STALL MODE: Neigiamas srautas`;
            getEl('eta-display').classList.add('bg-orange-500/10', 'text-orange-500');
        }

        if (proj.delta_impact > 0) {
            getEl('delta-impact-display').innerText = `1h kelyje = -${proj.delta_impact.toFixed(1)} d. laisvės`;
            getEl('delta-impact-display').classList.remove('hidden');
        }
    }

    const { data: port } = await db.from('investment_portfolio_view').select('*');
    if (port) {
        getEl('portfolio-list').innerHTML = port.map(i => `
            <div class="glass-card p-4 rounded-3xl flex justify-between items-center border border-primary-500/10 mb-2">
                <div><p class="label-tiny">${i.symbol}</p><p class="font-black">${i.quantity.toLocaleString()}</p></div>
                <div class="text-right"><p class="font-bold text-primary-500">$${(i.market_value).toLocaleString()}</p></div>
            </div>
        `).join('');
    }

    const { data: v } = await db.from('finance_vehicles').select('*').eq('status', 'active');
    if (v) getEl('vehicle-select').innerHTML = v.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
}

// --- SHIFT & FINANCE ---
async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    if (data) {
        activeShiftId = data.id;
        shiftStartTime = new Date(data.start_time);
        getEl('active-vehicle-info').innerText = data.vehicle_name;
        getEl('pre-shift-form').classList.add('hidden');
        getEl('active-shift-view').classList.remove('hidden');
        startTimerLogic();
    }
}

function startTimerLogic() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        const el = getEl('shift-timer');
        if (el) el.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

async function startShift() {
    const vId = getEl('vehicle-select').value;
    const odo = getEl('start-odometer').value;
    if (!vId || !odo) return alert("Užpildykite duomenis");
    await db.from('finance_shifts').insert([{ vehicle_id: vId, start_odometer: parseFloat(odo), status: 'active' }]);
    location.reload();
}

async function saveIncome() {
    const amount = parseFloat(getEl('income-amount').value);
    const { data: asset } = await db.from('finance_assets').select('id').eq('name', 'Liquid Cash').single();
    await db.from('finance_transactions').insert([{ amount, direction: 'in', source: 'shift', shift_id: activeShiftId, asset_id: asset.id }]);
    location.reload();
}

async function completeShift() {
    const endOdo = getEl('end-odometer').value;
    if (!endOdo) return alert("Įveskite pabaigos ridą!");
    await db.from('finance_shifts').update({ end_odometer: parseFloat(endOdo), status: 'completed', end_time: new Date().toISOString() }).eq('id', activeShiftId);
    location.reload();
}

async function login() {
    const { error } = await db.auth.signInWithPassword({ 
        email: getEl('auth-email').value, 
        password: getEl('auth-pass').value 
    });
    if (error) alert(error.message); else location.reload();
}

async function logout() { 
    await db.auth.signOut(); 
    localStorage.clear(); 
    location.reload(); 
}

function setTheme(m, save = true) {
    const html = document.documentElement;
    if (m === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.classList.toggle('dark', isDark);
        if (save) localStorage.removeItem('theme');
    } else {
        html.classList.toggle('dark', m === 'dark');
        if (save) localStorage.theme = m;
    }
    
    // Vizualus mygtukų atnaujinimas modale
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('border-primary-500', 'bg-primary-500/10'));
    const activeBtn = getEl(`theme-${m}`);
    if (activeBtn) activeBtn.classList.add('border-primary-500', 'bg-primary-500/10');
}

function initTheme() { 
    setTheme(localStorage.theme || 'system', false); 
}

function toggleSettingsModal() { 
    getEl('settings-modal').classList.toggle('hidden'); 
}

function toggleIncomeModal() { 
    getEl('income-modal').classList.toggle('hidden'); 
}

function showEndShiftForm() { 
    getEl('active-shift-view').classList.add('hidden'); 
    getEl('end-shift-form').classList.remove('hidden'); 
}

function cancelEndShift() { 
    getEl('end-shift-form').classList.add('hidden'); 
    getEl('active-shift-view').classList.remove('hidden'); 
}

window.addEventListener('DOMContentLoaded', init);
