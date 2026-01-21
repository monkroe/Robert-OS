/* ═══════════════════════════════════════════════════════════
   ROBERT ❤️ OS v8.3.1 - STABLE ENGINE
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co', // TIKSLIAI KAIP PRAŠEI
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy', // ĮRAŠYK SAVO RAKTĄ
    VERSION: '8.3.1'
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

// --- TOAST SYSTEM ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? 'fa-check-circle text-green-500' : (type === 'error' ? 'fa-exclamation-triangle text-red-500' : 'fa-info-circle');
    toast.innerHTML = `<i class="fa-solid ${icon} text-xl"></i><div><p class="font-bold text-sm uppercase">${type}</p><p class="text-xs opacity-80">${msg}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

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

// --- TABS LOGIC (FIXED) ---
function switchTab(id) {
    state.activeTab = id;
    // 1. Slepiame visus tabus naudodami 'hidden' klasę (garantuotas veikimas)
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });
    // 2. Rodome tik pasirinktą
    const activeEl = document.getElementById(`tab-${id}`);
    if(activeEl) {
        activeEl.classList.remove('hidden');
        setTimeout(() => activeEl.classList.add('active'), 10); // Animacijai
    }
    // 3. Atnaujiname mygtukus
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.id === `btn-${id}`);
    });
    refreshAll();
}

// --- SETUP ---
async function checkSystemHealth() {
    const { data: settings } = await db.from('finance_settings').select('user_id').maybeSingle();
    if (!settings) document.getElementById('setup-modal').classList.remove('hidden');
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
        showToast('System Ready', 'success');
    } catch (e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- AUTH ---
async function login() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value;
    state.loading = true;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if(error) { showToast(error.message, 'error'); state.loading = false; } else location.reload();
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

// --- SHIFT & TRANS ---
function openOdoModal() { document.getElementById('odo-modal').classList.remove('hidden'); }
function openEndModal() { document.getElementById('end-shift-modal').classList.remove('hidden'); }
function openTransactionModal(dir) {
    state.txDirection = dir;
    document.getElementById('tx-title').textContent = dir === 'in' ? 'Pajamos' : 'Išlaidos';
    document.getElementById('tx-amount').value = '';
    document.getElementById('transaction-modal').classList.remove('hidden');
}

async function confirmShiftAction() {
    const odo = document.getElementById('odo-input').value;
    if(!odo) return showToast('Įveskite ODO', 'error');
    state.loading = true;
    try {
        const { data: v } = await db.from('vehicles').select('id').eq('is_active', true).limit(1).single();
        await db.from('finance_shifts').insert({ user_id: state.user.id, vehicle_id: v?.id, start_odo: odo, status: 'active' });
        closeModals(); refreshAll(); showToast('Shift Started', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

async function finishShift() {
    const endOdo = parseFloat(document.getElementById('end-odo').value);
    const income = parseFloat(document.getElementById('end-income').value) || 0;
    const fuel = parseFloat(document.getElementById('end-fuel').value) || 0;
    if(!endOdo) return showToast('Reikalingas ODO', 'error');
    state.loading = true;
    try {
        const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
        if(income > 0) await db.from('finance_transactions').insert({ user_id: state.user.id, asset_id: asset.id, amount: income, direction: 'in', shift_id: state.activeShift.id });
        if(fuel > 0) await db.from('finance_transactions').insert({ user_id: state.user.id, asset_id: asset.id, amount: fuel, direction: 'out', shift_id: state.activeShift.id });
        await db.from('finance_shifts').update({ end_odo: endOdo, status: 'completed', end_time: new Date().toISOString() }).eq('id', state.activeShift.id);
        closeModals(); refreshAll(); showToast('Shift Closed', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

async function confirmTransaction() {
    const amt = parseFloat(document.getElementById('tx-amount').value);
    if(!amt) return showToast('Nėra sumos', 'error');
    state.loading = true;
    try {
        const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
        await db.from('finance_transactions').insert({ user_id: state.user.id, asset_id: asset.id, amount: amt, direction: state.txDirection, shift_id: state.activeShift?.id });
        closeModals(); refreshAll(); showToast('Saved', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
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
    if(!symbol || !qty || !price) return showToast('Trūksta duomenų', 'error');
    state.loading = true;
    try {
        let { data: asset } = await db.from('investment_assets').select('id').eq('symbol', symbol).maybeSingle();
        if(!asset) {
            const { data: newAsset } = await db.from('investment_assets').insert({ user_id: state.user.id, symbol: symbol, name: symbol, asset_type: state.buyType, current_price: price }).select().single();
            asset = newAsset;
        }
        const { data: fiat } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
        await db.from('investment_transactions').insert({ user_id: state.user.id, investment_id: asset.id, fiat_asset_id: fiat.id, type: 'buy', quantity: qty, price_per_unit: price, total_fiat: qty * price });
        closeModals(); refreshAll(); showToast('Asset Purchased', 'success');
    } catch(e) { showToast(e.message, 'error'); } finally { state.loading = false; }
}

// --- UI ---
function updateUI(key) {
    if(key === 'loading') document.getElementById('loading').classList.toggle('hidden', !state.loading);
    
    if(key === 'summary') {
        document.getElementById('buffer-bar').style.width = `${state.summary.buffer_pct}%`;
        document.getElementById('runway-val').innerHTML = `${state.summary.runway_months} <span class="text-xs text-gray-500 font-sans">mo</span>`;
        document.getElementById('stat-liquid').textContent = `$${Math.round(state.summary.total_liquid).toLocaleString()}`;
    }
    if(key === 'netWorth') document.getElementById('net-worth-val').textContent = `$${Math.round(state.netWorth).toLocaleString()}`;

    if(key === 'activeShift') {
        const btn = document.getElementById('shift-btn');
        if(state.activeShift) {
            btn.innerHTML = '<i class="fa-solid fa-stop mr-2"></i> END SHIFT';
            btn.classList.remove('btn-action-start'); btn.classList.add('btn-action-stop');
            btn.onclick = openEndModal;
            startTimer();
        } else {
            btn.innerHTML = '<i class="fa-solid fa-play mr-2"></i> START SHIFT';
            btn.classList.remove('btn-action-stop'); btn.classList.add('btn-action-start');
            btn.onclick = openOdoModal;
            stopTimer();
        }
    }
}

function closeModals() { document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden')); }
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
