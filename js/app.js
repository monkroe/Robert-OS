/* js/app.js - v8.0.1 */
const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co', // PAKEISTI!
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy', // PAKEISTI!
    VERSION: '8.0.1'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const state = new Proxy({
    user: null,
    summary: { total_liquid: 0, runway_months: 0, buffer_pct: 0 },
    activeShift: null,
    loading: false,
    activeTab: 'cockpit'
}, {
    set(target, key, value) {
        target[key] = value;
        updateUI(key);
        return true;
    }
});

async function init() {
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

async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    state.loading = true;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) alert('Klaida: ' + error.message);
    else location.reload();
    state.loading = false;
}

function updateUI(key) {
    if (key === 'summary') {
        document.getElementById('buffer-bar').style.width = `${state.summary.buffer_pct}%`;
        document.getElementById('stat-liquid').textContent = `$${state.summary.total_liquid.toLocaleString()}`;
        document.getElementById('runway-val').textContent = state.summary.runway_months;
    }
    if (key === 'loading') document.getElementById('loading').classList.toggle('hidden', !state.loading);
}

async function refreshAll() {
    const { data } = await db.from('user_financial_summary').select('*').single();
    if (data) state.summary = data;
}

function setupRealtime() {
    db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe();
}

async function saveTransaction(direction) {
    const amount = parseFloat(prompt(`Suma (${direction}):`));
    if (!amount) return;
    const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
    await db.from('finance_transactions').insert({
        user_id: state.user.id,
        asset_id: asset.id,
        amount,
        direction
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.id === `btn-${tabId}`));
}

function showAuthScreen(show) {
    document.getElementById('auth-screen').classList.toggle('hidden', !show);
    document.getElementById('app-content').classList.toggle('hidden', show);
}

document.addEventListener('DOMContentLoaded', init);
