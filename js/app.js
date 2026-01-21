/* ═══════════════════════════════════════════════════════════
   ROBERT ❤️ OS v8.0.0 - LAYER 3 ENABLED
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co', // PAKEISK Į SAVO!
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy', // PAKEISK Į SAVO!
    VERSION: '8.0.0'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const state = new Proxy({
    user: null,
    summary: { total_liquid: 0, runway_months: 0, buffer_pct: 0 },
    netWorth: 0,
    activeShift: null,
    theme: localStorage.getItem('theme') || 'dark',
    activeTab: 'cockpit',
    buyType: 'crypto', // Default
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
    if($('auto-year')) $('auto-year').textContent = new Date().getFullYear();
    
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        showAuthScreen(false);
        setupRealtime();
        refreshAll();
    } else {
        showAuthScreen(true);
    }
}

// --- AUTH ---
async function login() {
    const email = $('auth-email').value.trim();
    const password = $('auth-pass').value;
    if(!email || !password) return alert('Įveskite duomenis');
    
    state.loading = true;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if(error) { alert(error.message); state.loading = false; }
    else location.reload();
}

async function logout() {
    state.loading = true;
    await db.auth.signOut();
    localStorage.clear();
    location.reload();
}

// --- CORE DATA ---
async function refreshAll() {
    // 1. Financial Summary (Layer 2)
    const { data: summary } = await db.from('user_financial_summary').select('*').maybeSingle();
    if(summary) state.summary = summary;

    // 2. Net Worth (Layer 4)
    const { data: nw } = await db.from('total_net_worth_live').select('net_worth').maybeSingle();
    if(nw) state.netWorth = nw.net_worth;

    // 3. Active Shift (Layer 1)
    const { data: shift } = await db.from('finance_shifts').select('*').eq('status', 'active').maybeSingle();
    state.activeShift = shift;

    // 4. Tab Specific Data
    if(state.activeTab === 'vault') refreshVault();
    if(state.activeTab === 'audit') refreshAudit();
}

async function refreshVault() {
    const { data } = await db.from('investment_assets').select('*').order('quantity', {ascending: false});
    const container = $('asset-list');
    if(!container) return;
    
    if(data && data.length > 0) {
        container.innerHTML = data.map(a => `
            <div class="glass-card p-4 rounded-2xl flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs border border-white/10">
                        ${a.symbol.substring(0,3)}
                    </div>
                    <div>
                        <p class="font-bold text-sm">${a.name}</p>
                        <p class="text-[10px] text-slate-500">${parseFloat(a.quantity).toFixed(4)} ${a.symbol}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-teal-400">$${(a.quantity * a.current_price).toLocaleString()}</p>
                    <p class="text-[9px] text-slate-500">Avg: $${parseFloat(a.avg_buy_price).toFixed(2)}</p>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<div class="text-center py-10 opacity-30 uppercase font-black text-xs tracking-widest">Vault Empty</div>';
    }
}

async function refreshAudit() {
    // Paprasta transakcijų istorija
    const { data } = await db.from('finance_transactions').select('*').order('date', {ascending: false}).limit(20);
    const container = $('audit-list');
    if(!container) return;

    if(data && data.length > 0) {
        container.innerHTML = data.map(t => `
            <div class="glass-card p-4 rounded-2xl flex justify-between items-center">
                <div>
                    <p class="text-[10px] text-slate-500 uppercase font-bold">${new Date(t.date).toLocaleDateString()}</p>
                    <p class="font-bold text-xs uppercase">${t.direction === 'in' ? 'Income' : 'Expense'}</p>
                </div>
                <p class="font-mono font-bold ${t.direction === 'in' ? 'text-green-400' : 'text-red-400'}">
                    ${t.direction === 'in' ? '+' : '-'}$${parseFloat(t.amount).toLocaleString()}
                </p>
            </div>
        `).join('');
    }
}

// --- ACTIONS ---

// 1. Shift Logic
function openOdoModal() { $('odo-modal').classList.remove('hidden'); }

async function confirmShiftAction() {
    const odo = $('odo-input').value;
    if(!odo) return;
    state.loading = true;
    
    try {
        if(!state.activeShift) {
            await db.from('finance_shifts').insert({ user_id: state.user.id, start_odo: odo, status: 'active' });
        } else {
            await db.from('finance_shifts').update({ end_odo: odo, status: 'completed', end_time: new Date().toISOString() }).eq('id', state.activeShift.id);
        }
        closeModals();
        refreshAll();
    } catch(e) { alert(e.message); } 
    finally { state.loading = false; }
}

// 2. Transaction Logic
async function saveTransaction(dir) {
    const amt = parseFloat(prompt(`Suma (${dir}):`));
    if(!amt) return;
    state.loading = true;
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert({ user_id: state.user.id, asset_id: asset.id, amount: amt, direction: dir, shift_id: state.activeShift?.id });
    state.loading = false;
    refreshAll();
}

// 3. Investment Logic (NEW)
function openBuyModal() { $('buy-modal').classList.remove('hidden'); }
function selectAssetType(type) {
    state.buyType = type;
    $('btn-type-crypto').className = `asset-type-btn ${type === 'crypto' ? 'active' : ''}`;
    $('btn-type-stock').className = `asset-type-btn ${type === 'stock' ? 'active' : ''}`;
}

async function confirmBuyAction() {
    const symbol = $('buy-symbol').value.toUpperCase();
    const qty = parseFloat($('buy-amount').value);
    const price = parseFloat($('buy-price').value);
    
    if(!symbol || !qty || !price) return alert('Užpildykite visus laukus');
    
    state.loading = true;
    try {
        // 1. Find or Create Asset
        let { data: asset } = await db.from('investment_assets').select('id').eq('symbol', symbol).maybeSingle();
        
        if(!asset) {
            const { data: newAsset, error } = await db.from('investment_assets').insert({
                user_id: state.user.id,
                symbol: symbol,
                name: symbol, // Laikinai tas pats
                asset_type: state.buyType,
                current_price: price
            }).select().single();
            if(error) throw error;
            asset = newAsset;
        }

        // 2. Find Source Fiat
        const { data: fiat } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();

        // 3. Execute Transaction (Trigger handles the rest)
        const { error: txError } = await db.from('investment_transactions').insert({
            user_id: state.user.id,
            investment_id: asset.id,
            fiat_asset_id: fiat.id,
            type: 'buy',
            quantity: qty,
            price_per_unit: price,
            total_fiat: qty * price
        });
        
        if(txError) throw txError;
        
        closeModals();
        refreshAll();
        
    } catch(e) {
        alert('Klaida: ' + e.message);
    } finally {
        state.loading = false;
    }
}


// --- UI ---
function updateUI(key) {
    if(key === 'loading' && $('loading')) $('loading').classList.toggle('hidden', !state.loading);
    
    if(key === 'summary') {
        if($('buffer-bar')) $('buffer-bar').style.width = `${state.summary.buffer_pct}%`;
        if($('runway-val')) $('runway-val').textContent = state.summary.runway_months;
        if($('stat-liquid')) $('stat-liquid').textContent = `$${Math.round(state.summary.total_liquid).toLocaleString()}`;
    }

    if(key === 'netWorth' && $('net-worth-val')) {
        $('net-worth-val').textContent = `$${Math.round(state.netWorth).toLocaleString()}`;
    }

    if(key === 'activeShift' && $('shift-btn')) {
        const btn = $('shift-btn');
        if(state.activeShift) {
            btn.textContent = 'END SHIFT';
            btn.classList.replace('bg-teal-500', 'bg-red-500');
            startTimer();
        } else {
            btn.textContent = 'START SHIFT';
            btn.classList.replace('bg-red-500', 'bg-teal-500');
            stopTimer();
        }
    }
}

// --- UTILS ---
const $ = (id) => document.getElementById(id);
function closeModals() { 
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden')); 
}
function switchTab(id) {
    state.activeTab = id;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('active', el.id === `tab-${id}`));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.id === `btn-${id}`));
    refreshAll();
}
function setupRealtime() { db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe(); }
function showAuthScreen(show) { $('auth-screen').classList.toggle('hidden', !show); $('app-content').classList.toggle('hidden', show); }

// Timer Logic
let timerInt;
function startTimer() {
    stopTimer();
    const start = new Date(state.activeShift.start_time);
    timerInt = setInterval(() => {
        const diff = Math.floor((new Date() - start)/1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        if($('shift-timer')) $('shift-timer').textContent = `${h}:${m}:${s}`;
    }, 1000);
}
function stopTimer() { clearInterval(timerInt); if($('shift-timer')) $('shift-timer').textContent = '00:00:00'; }
function initTheme() {
    document.documentElement.classList.toggle('light', state.theme === 'light');
    if($('theme-icon')) $('theme-icon').innerHTML = state.theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}
function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', state.theme); initTheme(); }

document.addEventListener('DOMContentLoaded', init);
