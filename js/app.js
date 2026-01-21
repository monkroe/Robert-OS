/* js/app.js - v8.0.0 */
const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy',
    VERSION: '8.0.0'
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

async function init() {
    initTheme();
    document.getElementById('auto-year').textContent = new Date().getFullYear();
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        showAuthScreen(false);
        refreshAll();
    } else {
        showAuthScreen(true);
    }
}

function initTheme() {
    document.documentElement.classList.toggle('light', state.theme === 'light');
    const icon = document.querySelector('#theme-icon i');
    if (icon) icon.className = state.theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    initTheme();
}

async function login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    state.loading = true;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else location.reload();
}

async function logout() {
    state.loading = true;
    await db.auth.signOut();
    localStorage.clear();
    location.reload();
}

async function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.id === `btn-${tabId}`));
}

function updateUI(key) {
    if (key === 'loading') document.getElementById('loading').classList.toggle('hidden', !state.loading);
}

async function refreshAll() {
    // Duomenų atnaujinimo logika
}

function openOdoModal() { document.getElementById('odo-modal').classList.remove('hidden'); }
function closeModals() { document.getElementById('odo-modal').classList.add('hidden'); }
function showAuthScreen(show) { 
    document.getElementById('auth-screen').classList.toggle('hidden', !show); 
    document.getElementById('app-content').classList.toggle('hidden', show); 
}

document.addEventListener('DOMContentLoaded', init);
