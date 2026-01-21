/* ═══════════════════════════════════════════════════════════
   ROBERT ❤️ OS v8.2.1 - PRODUCTION LOGIC
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co', // ĮRAŠYK SAVO URL (pvz. https://xyz.supabase.co)
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy', // ĮRAŠYK SAVO ANON KEY
    VERSION: '8.2.1'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const state = new Proxy({
    user: null,
    summary: { total_liquid: 0, runway_months: 0, buffer_pct: 0, monthly_burn: 0 },
    netWorth: 0,
    activeShift: null,
    theme: localStorage.getItem('theme') || 'dark',
    activeTab: 'cockpit',
    buyType: 'crypto',
    txDirection: 'in',
    loading: false
}, {
    set(target, key, value) {
        target[key] = value;
        updateUI(key);
        return true;
    }
});

// --- INIT ---
async function init() {
    initTheme();
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        showAuthScreen(false);
        setupRealtime();
        await checkSystemHealth();
        refreshAll();
    } else {
        showAuthScreen(true);
    }
}

// --- SETUP ---
async function checkSystemHealth() {
    const { data: settings } = await db.from('finance_settings').select('user_id').maybeSingle();
    if (!settings && document.getElementById('setup-modal')) {
        document.getElementById('setup-modal').classList.remove('hidden');
    }
}
async function finishSetup() {
    const cash = parseFloat(document.getElementById('setup-cash').value) || 0;
    const burn = parseFloat(document.getElementById('setup-burn').value) || 2500;
    const car = document.getElementById('setup-car').value || 'My Car';
    state.loading = true;
    try {
        await db.from('finance_settings').insert({ user_id: state.user.id, monthly_burn: burn, emergency_buffer_target: burn * 6 });
        await db.from('finance_assets').insert({ user_id: state.user.id, name: 'Main Cash', category: 'cash', cached_balance: cash, is_liquid: true, include_in_net_worth: true });
        await db.from('vehicles').insert({ user_id: state.user.id, name: car, plate: 'DEFAULT', is_active: true });
        document.getElementById('setup-modal').classList.add('hidden');
        refreshAll();
    } catch (e) { alert(e.message); } finally { state.loading = false; }
}

// --- AUTH ---
async function login() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value;
    state.loading = true;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if(error) { alert(error.message); state.loading = false; } else location.reload();
}
async function logout() {
    state.loading = true;
    await db.auth.signOut();
    localStorage.clear();
    location.reload();
}

// --- DATA ---
async function refreshAll() {
    const { data: summary } = await db.from('user_financial_summary').select('*').maybeSingle();
    if(summary) state.summary = summary;
    const { data: nw } = await db.from('total_net_worth_live').select('net_worth').maybeSingle();
    if(nw) state.netWorth = nw.net_worth;
    const { data: shift } = await db.from('finance_shifts').select('*').eq('status', 'active').maybeSingle();
    state.activeShift = shift;
    
    if(state.activeTab === 'vault') refreshVault();
    if(state.activeTab === 'audit') refreshAudit();
}

async function refreshVault() {
    const { data } = await db.from('investment_assets').select('*').order('quantity', {ascending: false});
    const el = document.getElementById('asset-list');
    if(!el) return;
    el.innerHTML = data && data.length ? data.map(a => `
        <div class="bento-card flex-row justify-between items-center p-4 mb-2">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center font-bold text-teal-500 text-xs">${a.symbol.substring(0,3)}</div>
                <div><p class="font-bold text-sm">${a.name}</p><p class="text-[10px] text-gray-500 font-mono">${parseFloat(a.quantity).toFixed(4)} ${a.symbol}</p></div>
            </div>
            <div class="text-right"><p class="font-bold text-teal-400 font-mono">$${(a.quantity * a.current_price).toLocaleString()}</p></div>
        </div>`).join('') : '<div class="text-center py-4 opacity-50 text-xs">VAULT EMPTY</div>';
}

async function refreshAudit() {
    const { data } = await db.from('finance_transactions').select('*').order('date', {ascending: false}).limit(15);
    const el = document.getElementById('audit-list');
    if(!el) return;
    el.innerHTML = data && data.length ? data.map(t => `
        <div class="bento-card flex-row justify-between items-center p-3 mb-2">
            <div><p class="text-[9px] text-gray-500 font-bold uppercase">${new Date(t.date).toLocaleDateString()}</p><p class="font-bold text-xs">${t.direction === 'in' ? 'INCOME' : 'EXPENSE'}</p></div>
            <p class="font-mono font-bold ${t.direction === 'in' ? 'text-green-500' : 'text-red-500'}">${t.direction === 'in' ? '+' : '-'}$${parseFloat(t.amount).toLocaleString()}</p>
        </div>`).join('') : '';
}

// --- SHIFT LOGIC ---
function openOdoModal() { document.getElementById('odo-modal').classList.remove('hidden'); }
function openEndModal() { document.getElementById('end-shift-modal').classList.remove('hidden'); }

async function confirmShiftAction() {
    const odo = document.getElementById('odo-input').value;
    if(!odo) return;
    state.loading = true;
    try {
        const { data: v } = await db.from('vehicles').select('id').eq('is_active', true).limit(1).single();
        await db.from('finance_shifts').insert({ user_id: state.user.id, vehicle_id: v?.id, start_odo: odo, status: 'active' });
        closeModals(); refreshAll();
    } catch(e) { alert(e.message); } finally { state.loading = false; }
}

async function finishShift() {
    const endOdo = parseFloat(document.getElementById('end-odo').value);
    const income = parseFloat(document.getElementById('end-income').value) || 0;
    const fuel = parseFloat(document.getElementById('end-fuel').value) || 0;
    if(!endOdo) return alert('Įveskite ODO');
    state.loading = true;
    try {
        const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
        if(income > 0) await db.from('finance_transactions').insert({ user_id: state.user.id, asset_id: asset.id, amount: income, direction: 'in', shift_id: state.activeShift.id });
        if(fuel > 0) await db.from('finance_transactions').insert({ user_id: state.user.id, asset_id: asset.id, amount: fuel, direction: 'out', shift_id: state.activeShift.id });
        await db.from('finance_shifts').update({ end_odo: endOdo, status: 'completed', end_time: new Date().toISOString() }).eq('id', state.activeShift.id);
        closeModals(); refreshAll(); alert('Pamaina uždaryta!');
    } catch(e) { alert(e.message); } finally { state.loading = false; }
}

// --- TRANSACTIONS (NAUJAS MODALAS) ---
function openTransactionModal(dir) {
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Pridėti Pajamas' : 'Pridėti Išlaidas';
    document.getElementById('tx-amount').value = '';
    document.getElementById('transaction-modal').classList.remove('hidden');
    document.getElementById('tx-amount').focus();
}

async function confirmTransaction() {
    const amt = parseFloat(document.getElementById('tx-amount').value);
    if(!amt) return;
    state.loading = true;
    try {
        const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
        await db.from('finance_transactions').insert({ 
            user_id: state.user.id, 
            asset_id: asset.id, 
            amount: amt, 
            direction: state.txDirection, 
            shift_id: state.activeShift?.id 
        });
        closeModals(); refreshAll();
    } catch(e) { alert(e.message); } finally { state.loading = false; }
}

// --- INVEST ---
function openBuyModal() { document.getElementById('buy-modal').classList.remove('hidden'); }
function selectAssetType(type) {
    state.buyType = type;
    document.getElementById('btn-type-crypto').className = `asset-type-btn ${type === 'crypto' ? 'active' : ''}`;
    document.getElementById('btn-type-stock').className = `asset-type-btn ${type === 'stock' ? 'active' : ''}`;
}
async function confirmBuyAction() {
    const symbol = document.getElementById('buy-symbol').value.toUpperCase();
    const qty = parseFloat(document.getElementById('buy-amount').value);
    const price = parseFloat(document.getElementById('buy-price').value);
    if(!symbol || !qty || !price) return;
    state.loading = true;
    try {
        let { data: asset } = await db.from('investment_assets').select('id').eq('symbol', symbol).maybeSingle();
        if(!asset) {
            const { data: newAsset } = await db.from('investment_assets').insert({ user_id: state.user.id, symbol: symbol, name: symbol, asset_type: state.buyType, current_price: price }).select().single();
            asset = newAsset;
        }
        const { data: fiat } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
        await db.from('investment_transactions').insert({ user_id: state.user.id, investment_id: asset.id, fiat_asset_id: fiat.id, type: 'buy', quantity: qty, price_per_unit: price, total_fiat: qty * price });
        closeModals(); refreshAll();
    } catch(e) { alert(e.message); } finally { state.loading = false; }
}

// --- UI UPDATER ---
function updateUI(key) {
    const $ = (id) => document.getElementById(id);
    if(key === 'loading' && $('loading')) $('loading').classList.toggle('hidden', !state.loading);
    
    if(key === 'summary') {
        if($('buffer-bar')) $('buffer-bar').style.width = `${state.summary.buffer_pct}%`;
        if($('runway-val')) $('runway-val').innerHTML = `${state.summary.runway_months} <span class="text-xs text-gray-500 font-sans">mo</span>`;
        if($('stat-liquid')) $('stat-liquid').textContent = `$${Math.round(state.summary.total_liquid).toLocaleString()}`;
    }
    if(key === 'netWorth' && $('net-worth-val')) $('net-worth-val').textContent = `$${Math.round(state.netWorth).toLocaleString()}`;

    // SHIFT BUTTON
    if(key === 'activeShift' && $('shift-btn')) {
        const btn = $('shift-btn');
        if(state.activeShift) {
            btn.innerHTML = '<i class="fa-solid fa-stop mr-2"></i> END SHIFT';
            btn.classList.remove('btn-action-start');
            btn.classList.add('btn-action-stop');
            btn.onclick = openEndModal;
            startTimer();
        } else {
            btn.innerHTML = '<i class="fa-solid fa-play mr-2"></i> START SHIFT';
            btn.classList.remove('btn-action-stop');
            btn.classList.add('btn-action-start');
            btn.onclick = openOdoModal;
            stopTimer();
        }
    }
}

// --- UTILS ---
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden')); }

// TAB SWITCHING (FIXED)
function switchTab(id) {
    state.activeTab = id;
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.toggle('active', el.id === `tab-${id}`);
    });
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.id === `btn-${id}`);
    });
    refreshAll();
}

function setupRealtime() { db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe(); }
function showAuthScreen(show) { document.getElementById('auth-screen').classList.toggle('hidden', !show); document.getElementById('app-content').classList.toggle('hidden', show); }
let timerInt;
function startTimer() { stopTimer(); const start = new Date(state.activeShift.start_time); timerInt = setInterval(() => { 
    const diff = Math.floor((new Date() - start)/1000); 
    const h = String(Math.floor(diff/3600)).padStart(2,'0'); const m = String(Math.floor((diff%3600)/60)).padStart(2,'0'); const s = String(diff%60).padStart(2,'0');
    if(document.getElementById('shift-timer')) document.getElementById('shift-timer').textContent = `${h}:${m}:${s}`; 
}, 1000); }
function stopTimer() { clearInterval(timerInt); if(document.getElementById('shift-timer')) document.getElementById('shift-timer').textContent = '00:00:00'; }
function initTheme() { document.documentElement.classList.toggle('light', state.theme === 'light'); }
function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', state.theme); initTheme(); }

document.addEventListener('DOMContentLoaded', init);
