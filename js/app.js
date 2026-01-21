/* ROBERT ❤️ OS v4.9.0 - GOAL MASTERY */

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

// --- GLOBAL MANAGEMENT ---
function toggleAssetManageModal() {
    const modal = getEl('asset-manage-modal');
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) prepareManageFields();
}

async function prepareManageFields() {
    // Krauname turtą
    const { data: fiat } = await db.from('finance_assets').select('cached_balance').eq('name', 'Liquid Cash').single();
    const { data: kas } = await db.from('investment_assets').select('quantity, current_price').eq('symbol', 'KAS').single();
    
    // Krauname tikslus
    const { data: goals } = await db.from('life_goals').select('*');

    if (fiat) getEl('edit-fiat-balance').value = fiat.cached_balance;
    if (kas) {
        getEl('edit-kas-qty').value = kas.quantity;
        getEl('edit-kas-price').value = kas.current_price;
    }

    if (goals) {
        const nwGoal = goals.find(g => g.goal_type === 'net_worth');
        const kasGoal = goals.find(g => g.goal_type === 'asset_quantity');
        if (nwGoal) getEl('edit-goal-nw').value = nwGoal.target_net_worth;
        if (kasGoal) getEl('edit-goal-kas').value = kasGoal.target_value;
    }
}

async function saveGlobalChanges() {
    const fBal = parseFloat(getEl('edit-fiat-balance').value) || 0;
    const kQty = parseFloat(getEl('edit-kas-qty').value) || 0;
    const kPri = parseFloat(getEl('edit-kas-price').value) || 0;
    const gNw = parseFloat(getEl('edit-goal-nw').value) || 0;
    const gKas = parseFloat(getEl('edit-goal-kas').value) || 0;

    try {
        // 1. Atnaujiname turtą
        await db.from('finance_assets').update({ cached_balance: fBal }).eq('name', 'Liquid Cash');
        await db.from('investment_assets').update({ quantity: kQty, current_price: kPri }).eq('symbol', 'KAS');

        // 2. Atnaujiname tikslus (Naudojame UPSERT, kad būtų saugiau)
        const user = (await db.auth.getUser()).data.user;
        
        await db.from('life_goals').upsert({ 
            user_id: user.id, goal_type: 'net_worth', target_net_worth: gNw 
        }, { onConflict: 'user_id, goal_type' });

        await db.from('life_goals').upsert({ 
            user_id: user.id, goal_type: 'asset_quantity', asset_symbol: 'KAS', target_value: gKas 
        }, { onConflict: 'user_id, goal_type' });

        alert("Visi nustatymai išsaugoti!");
        location.reload();
    } catch (e) { alert("Klaida: " + e.message); }
}

// --- DATA LOADING ---
async function loadAllData() {
    // 1. Projections & ETA
    const { data: goals } = await db.from('goal_projection_view').select('*');
    const nwGoal = goals?.find(g => g.goal_type === 'net_worth');
    
    if (nwGoal) {
        getEl('net-worth-display').innerText = `$${parseFloat(nwGoal.current_nw).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
        const eta = nwGoal[`eta_${selectedWindow}d`];
        if (eta > 0) getEl('eta-display').innerText = `ETA: ${(eta / 12).toFixed(1)} m. iki laisvės`;
        else getEl('eta-display').innerText = `STALL MODE: Dirbk daugiau!`;
    }

    // 2. Goals Progress Bars
    if (goals) {
        getEl('goals-progress-container').innerHTML = goals.map(g => {
            const title = g.goal_type === 'net_worth' ? 'Net Worth Target' : `${g.asset_symbol} Accumulation`;
            const targetStr = g.goal_type === 'net_worth' ? `$${g.target_net_worth.toLocaleString()}` : `${g.target_value.toLocaleString()} ${g.asset_symbol}`;
            return `
                <div class="space-y-1 text-left">
                    <div class="flex justify-between text-[9px] font-black uppercase opacity-60 px-1">
                        <span>${title}</span>
                        <span>${g.progress_pct.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-gray-800 h-3 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div class="bg-primary-500 h-full transition-all duration-1000 shadow-[0_0_10px_rgba(20,184,166,0.3)]" style="width: ${Math.min(g.progress_pct, 100)}%"></div>
                    </div>
                    <p class="text-[8px] text-right font-bold opacity-40 uppercase tracking-widest">Target: ${targetStr}</p>
                </div>
            `;
        }).join('');
    }

    // 3. Portfolio List
    const { data: port } = await db.from('investment_portfolio_view').select('*');
    if (port) {
        getEl('portfolio-list').innerHTML = port.map(i => `
            <div class="glass-card p-5 rounded-[2rem] flex justify-between items-center mb-3">
                <div class="flex flex-col"><span class="label-tiny">${i.symbol} Holdings</span><span class="font-black text-lg">${i.quantity.toLocaleString()}</span></div>
                <div class="text-right"><span class="block font-black text-primary-500 text-xl">$${(i.market_value).toLocaleString()}</span><span class="label-tiny">Market Value</span></div>
            </div>
        `).join('');
    }

    const { data: v } = await db.from('finance_vehicles').select('*').eq('status', 'active');
    if (v) getEl.innerHTML = v.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
}

// --- SHIFT & FINANCE ---
async function checkActiveShift() {
    const { data } = await db.from('finance_active_shift_view').select('*').maybeSingle();
    if (data) {
        activeShiftId = data.id;
        shiftStartTime = new Date(data.start_time);
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
    await db.from('life_goals').upsert({ user_id: (await db.auth.getUser()).data.user.id, goal_type: 'net_worth' }); // Apsauga
    await db.from('finance_shifts').insert([{ vehicle_id: vId, start_odometer: parseFloat(odo), status: 'active' }]);
    location.reload();
}

async function saveIncome() {
    const amount = parseFloat(getEl('income-amount').value);
    const { data: asset } = await db.from('finance_assets').select('id').eq('name', 'Liquid Cash').single();
    await db.from('finance_transactions').insert([{ amount, direction: 'in', source: 'shift', shift_id: activeShiftId, asset_id: asset.id }]);
    location.reload();
}

// --- UTILS ---
function setWindow(days) {
    selectedWindow = days;
    document.querySelectorAll('.window-btn').forEach(b => {
        b.classList.remove('bg-primary-500', 'text-black', 'border-primary-500');
        b.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
    });
    getEl(`win-${days}`).classList.add('bg-primary-500', 'text-black', 'border-primary-500');
    loadAllData();
}
async function login() {
    const { error } = await db.auth.signInWithPassword({ email: getEl('auth-email').value, password: getEl('auth-pass').value });
    if (error) alert(error.message); else location.reload();
}
async function logout() { await db.auth.signOut(); localStorage.clear(); location.reload(); }
function setTheme(m) {
    const isDark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.theme = m;
}
function initTheme() { setTheme(localStorage.theme || 'system'); }
function toggleSettingsModal() { getEl('settings-modal').classList.toggle('hidden'); }
function toggleIncomeModal() { getEl('income-modal').classList.toggle('hidden'); }
function showEndShiftForm() { getEl('active-shift-view').classList.add('hidden'); getEl('end-shift-form').classList.remove('hidden'); }

window.addEventListener('DOMContentLoaded', init);
