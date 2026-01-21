/* js/app.js - v8.1.0 (Full Logic) */
const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy',
    VERSION: '8.1.0'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const state = new Proxy({
    user: null,
    summary: { total_liquid: 0, runway_months: 0, buffer_pct: 0, monthly_burn: 2500 },
    activeShift: null,
    theme: localStorage.getItem('theme') || 'dark',
    activeTab: 'cockpit',
    loading: false
}, {
    set(target, key, value) {
        target[key] = value;
        updateUI(key);
        return true;
    }
});

// INITIALIZATION
async function init() {
    initTheme();
    document.getElementById('auto-year').textContent = new Date().getFullYear();
    
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

// THEME CONTROL
function initTheme() {
    document.documentElement.classList.toggle('light', state.theme === 'light');
    updateThemeIcon();
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    initTheme();
}

function updateThemeIcon() {
    const icon = document.querySelector('#theme-icon i');
    if (icon) icon.className = state.theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// AUTH
async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    state.loading = true;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) alert('Klaida: ' + error.message);
    else location.reload();
    state.loading = false;
}

async function logout() {
    state.loading = true;
    await db.auth.signOut();
    localStorage.removeItem('supabase.auth.token'); // Išvalome sesiją
    location.reload();
}

// DATA REFRESH
async function refreshAll() {
    const { data: summary } = await db.from('user_financial_summary').select('*').single();
    if (summary) state.summary = summary;

    const { data: shift } = await db.from('finance_shifts').select('*, vehicles(name)').eq('status', 'active').maybeSingle();
    state.activeShift = shift;

    if (state.activeTab === 'vault') refreshVault();
    if (state.activeTab === 'audit') refreshAudit();
}

function updateUI(key) {
    const $ = (id) => document.getElementById(id);
    if (key === 'summary') {
        if ($('buffer-bar')) $('buffer-bar').style.width = `${state.summary.buffer_pct}%`;
        if ($('runway-val')) $('runway-val').textContent = state.summary.runway_months;
        if ($('stat-liquid')) $('stat-liquid').textContent = `$${Math.round(state.summary.total_liquid).toLocaleString()}`;
        if ($('stat-burn')) $('stat-burn').textContent = `$${state.summary.monthly_burn}`;
    }
    if (key === 'activeShift') {
        const btn = $('shift-btn');
        if (state.activeShift) {
            btn.textContent = 'END SHIFT';
            btn.classList.replace('bg-teal-500', 'bg-red-500');
            startTimer();
        } else {
            btn.textContent = 'START SHIFT';
            btn.classList.replace('bg-red-500', 'bg-teal-500');
            stopTimer();
        }
    }
    if (key === 'loading') $('loading').classList.toggle('hidden', !state.loading);
}

// NAVIGATION
async function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.id === `btn-${tabId}`));
    refreshAll();
}

// REALTIME
function setupRealtime() {
    db.channel('db-sync').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe();
}

// TRANSACTION ACTIONS
async function saveTransaction(direction) {
    const amount = parseFloat(prompt(`Suma (${direction}):`));
    if (!amount || isNaN(amount)) return;
    state.loading = true;
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert({ user_id: state.user.id, asset_id: asset.id, amount, direction });
    state.loading = false;
}

// SHIFT TIMER
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
function stopTimer() { clearInterval(timerInterval); if (document.getElementById('shift-timer')) document.getElementById('shift-timer').textContent = '00:00:00'; }

function openOdoModal() { document.getElementById('odo-modal').classList.remove('hidden'); }
function closeModals() { document.getElementById('odo-modal').classList.add('hidden'); }
function showAuthScreen(show) { document.getElementById('auth-screen').classList.toggle('hidden', !show); document.getElementById('app-content').classList.toggle('hidden', show); }

document.addEventListener('DOMContentLoaded', init);
