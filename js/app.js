/* ROBERT ❤️ OS v4.8.0 - WEALTH CONTROL */

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
    }
}

function updateFooter() {
    const yearEl = getEl('auto-year');
    if (yearEl) yearEl.innerText = new Date().getFullYear();
}

// --- ASSET MANAGEMENT (Manual Overrides) ---
function toggleAssetManageModal() {
    const modal = getEl('asset-manage-modal');
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        prepareAssetManageFields();
    }
}

async function prepareAssetManageFields() {
    // Užpildome laukus esamomis reikšmėmis iš DB
    const { data: fiat } = await db.from('finance_assets').select('cached_balance').eq('name', 'Liquid Cash').single();
    const { data: kas } = await db.from('investment_assets').select('quantity, current_price').eq('symbol', 'KAS').single();

    if (fiat) getEl('edit-fiat-balance').value = fiat.cached_balance;
    if (kas) {
        getEl('edit-kas-qty').value = kas.quantity;
        getEl('edit-kas-price').value = kas.current_price;
    }
}

async function saveAssetAdjustments() {
    const newFiat = parseFloat(getEl('edit-fiat-balance').value) || 0;
    const newKasQty = parseFloat(getEl('edit-kas-qty').value) || 0;
    const newKasPrice = parseFloat(getEl('edit-kas-price').value) || 0;

    try {
        // Atnaujiname Fiat (Liquid Cash)
        await db.from('finance_assets').update({ cached_balance: newFiat }).eq('name', 'Liquid Cash');
        
        // Atnaujiname Crypto (KAS)
        await db.from('investment_assets').update({ 
            quantity: newKasQty, 
            current_price: newKasPrice 
        }).eq('symbol', 'KAS');

        alert("Duomenys sėkmingai atnaujinti!");
        location.reload();
    } catch (e) {
        alert("Klaida atnaujinant: " + e.message);
    }
}

// --- DATA LOADING ---
async function loadAllData() {
    const { data: proj } = await db.from('goal_projection_view').select('*').maybeSingle();
    if (proj) {
        getEl('net-worth-display').innerText = `$${parseFloat(proj.current_nw).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
        const etaMonths = proj[`eta_${selectedWindow}d`];
        if (etaMonths && etaMonths > 0) {
            getEl('eta-display').innerText = `ETA: ${(etaMonths / 12).toFixed(1)} m. (pagal ${selectedWindow}D tempą)`;
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
            <div class="glass-card p-5 rounded-[2rem] flex justify-between items-center border border-primary-500/5 mb-3">
                <div class="flex flex-col"><span class="label-tiny">${i.symbol} Portfolio</span><span class="font-black text-lg">${i.quantity.toLocaleString()}</span></div>
                <div class="text-right"><span class="block font-black text-primary-500 text-xl">$${(i.market_value).toLocaleString()}</span><span class="label-tiny">Market Value</span></div>
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
    setInterval(() => {
        const diff = Math.floor((new Date() - shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        if (getEl('shift-timer')) getEl('shift-timer').innerText = `${h}:${m}:${s}`;
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

// --- COMMON UTILS ---
function setWindow(days) {
    selectedWindow = days;
    document.querySelectorAll('.window-btn').forEach(b => {
        b.classList.remove('bg-primary-500', 'text-black', 'border-primary-500');
        b.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
    });
    const activeBtn = getEl(`win-${days}`);
    activeBtn.classList.add('bg-primary-500', 'text-black', 'border-primary-500');
    loadAllData();
}

async function login() {
    const { error } = await db.auth.signInWithPassword({ email: getEl('auth-email').value, password: getEl('auth-pass').value });
    if (error) alert(error.message); else location.reload();
}

async function logout() { await db.auth.signOut(); localStorage.clear(); location.reload(); }

function setTheme(m, save = true) {
    const html = document.documentElement;
    if (m === 'system') html.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
    else html.classList.toggle('dark', m === 'dark');
    if (save) localStorage.theme = m;
}

function initTheme() { setTheme(localStorage.theme || 'system', false); }
function toggleSettingsModal() { getEl('settings-modal').classList.toggle('hidden'); }
function toggleIncomeModal() { getEl('income-modal').classList.toggle('hidden'); }
function showEndShiftForm() { getEl('active-shift-view').classList.add('hidden'); getEl('end-shift-form').classList.remove('hidden'); }

window.addEventListener('DOMContentLoaded', init);
