/* ═══════════════════════════════════════════════════════════
   ROBERT ❤️ OS v8.0 - "VELOCITY" ENGINE (2026 Edition)
   Architecture: Reactive State + Real-time DB Sync
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy',
    VERSION: '8.0.0'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// ┌─────────────────────────────────────────────────────────┐
// │ 1. REACTIVE STATE MANAGEMENT                           │
// └─────────────────────────────────────────────────────────┘
// Naudojame Proxy, kad UI atsinaujintų automatiškai pasikeitus duomenims
const state = new Proxy({
    user: null,
    summary: { total_liquid: 0, runway_months: 0, buffer_pct: 0, monthly_burn: 0 },
    activeShift: null,
    assets: [],
    transactions: [],
    loading: false,
    activeTab: 'cockpit'
}, {
    set(target, key, value) {
        target[key] = value;
        updateUI(key);
        return true;
    }
});

// ┌─────────────────────────────────────────────────────────┐
// │ 2. CORE INITIALIZATION                                 │
// └─────────────────────────────────────────────────────────┘

async function init() {
    console.log(`%c🚀 ROBERT OS v${CONFIG.VERSION} INITIALIZING...`, 'color: #14b8a6; font-weight: bold;');
    
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        state.user = session.user;
        await bootAuthenticatedApp();
    } else {
        showAuthScreen(true);
    }
}

async function bootAuthenticatedApp() {
    showAuthScreen(false);
    showLoading(true);
    
    try {
        await Promise.all([
            refreshFinancialSummary(),
            checkActiveShift(),
            setupRealtimeSubscriptions()
        ]);
        
        await switchTab(state.activeTab);
    } catch (err) {
        notify('Initialization failed', 'error');
    } finally {
        showLoading(false);
    }
}

// ┌─────────────────────────────────────────────────────────┐
// │ 3. DATA FETCHING (Using New SQL Views)                 │
// └─────────────────────────────────────────────────────────┘

async function refreshFinancialSummary() {
    const { data, error } = await db
        .from('user_financial_summary')
        .select('*')
        .single();
    
    if (!error && data) state.summary = data;
}

async function checkActiveShift() {
    const { data } = await db
        .from('finance_shifts')
        .select('*, vehicle:vehicles(name)')
        .eq('status', 'active')
        .maybeSingle();
    
    state.activeShift = data;
}

// ┌─────────────────────────────────────────────────────────┐
// │ 4. REAL-TIME SYNC (2026 Standard)                      │
// └─────────────────────────────────────────────────────────┘

function setupRealtimeSubscriptions() {
    // Automatiškai atnaujiname UI, kai DB pasikeičia balansas (per trigerius)
    db.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_assets' }, () => {
            refreshFinancialSummary();
            if (state.activeTab === 'vault') refreshVault();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'finance_transactions' }, () => {
            if (state.activeTab === 'audit') refreshAudit();
            notify('Transaction confirmed', 'success');
        })
        .subscribe();
}

// ┌─────────────────────────────────────────────────────────┐
// │ 5. UI UPDATER (Reactive Bridge)                        │
// └─────────────────────────────────────────────────────────┘

function updateUI(key) {
    const $ = (id) => document.getElementById(id);

    switch(key) {
        case 'summary':
            if ($('buffer-bar')) {
                const pct = state.summary.buffer_pct;
                $('buffer-bar').style.width = `${pct}%`;
                $('buffer-bar').className = `buffer-fill ${pct > 80 ? 'bg-teal-500' : pct > 40 ? 'bg-amber-500' : 'bg-red-500'}`;
            }
            if ($('runway-val')) $('runway-val').textContent = state.summary.runway_months;
            if ($('stat-liquid')) $('stat-liquid').textContent = `$${state.summary.total_liquid.toLocaleString()}`;
            break;

        case 'activeShift':
            const btn = $('shift-btn');
            if (state.activeShift) {
                btn.innerHTML = '<i class="fa-solid fa-stop mr-2"></i>End Shift';
                btn.classList.replace('bg-teal-500', 'bg-red-500');
                startTimer();
            } else {
                btn.innerHTML = '<i class="fa-solid fa-play mr-2"></i>Start Shift';
                btn.classList.replace('bg-red-500', 'bg-teal-500');
                stopTimer();
            }
            break;

        case 'loading':
            $('loading').classList.toggle('hidden', !state.loading);
            break;
    }
}

// ┌─────────────────────────────────────────────────────────┐
// │ 6. ACTIONS (Shifts & Transactions)                      │
// └─────────────────────────────────────────────────────────┘

async function saveTransaction(direction) {
    const amount = parseFloat(prompt(`Enter ${direction} amount:`));
    if (!amount || amount <= 0) return;

    // Gauname pirmo likvidaus turto ID (pvz. pagrindinė sąskaita)
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();

    const { error } = await db.from('finance_transactions').insert({
        user_id: state.user.id,
        asset_id: asset.id,
        amount: amount,
        direction: direction,
        shift_id: state.activeShift?.id || null
    });

    if (error) notify(error.message, 'error');
}

// ┌─────────────────────────────────────────────────────────┐
// │ 7. UI HELPERS                                           │
// └─────────────────────────────────────────────────────────┘

function notify(msg, type = 'info') {
    // 2026 m. modernus Toast pakaitalas paprastam alertui
    console.log(`[${type.toUpperCase()}] ${msg}`);
    const toast = document.createElement('div');
    toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl z-[600] animate-bounce-in`;
    toast.innerHTML = `<span class="${type === 'error' ? 'text-red-400' : 'text-teal-400'} font-bold">${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.id === `btn-${tabId}`));
    
    // Lazy load duomenis tik kai reikia
    if (tabId === 'vault') refreshVault();
    if (tabId === 'audit') refreshAudit();
}

// Laikmatis (Shift Timer)
let timerInterval;
function startTimer() {
    stopTimer();
    const start = new Date(state.activeShift.start_time);
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - start) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        document.getElementById('shift-timer').textContent = `${h}:${m}:${s}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    if (document.getElementById('shift-timer')) document.getElementById('shift-timer').textContent = '00:00:00';
}

function showAuthScreen(show) {
    document.getElementById('auth-screen').classList.toggle('hidden', !show);
    document.getElementById('app-content').classList.toggle('hidden', show);
}

function showLoading(show) { state.loading = show; }

document.addEventListener('DOMContentLoaded', init);
