/* ═══════════════════════════════════════════════════════════
   ROBERT ❤️ OS 8.0.0 - FULL PRODUCTION ENGINE
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
    SUPABASE_URL: 'https://TAVO_PROJEKTO_ID.supabase.co', 
    SUPABASE_KEY: 'TAVO_ANON_PUBLIC_KEY',
    VERSION: '8.0.0'
};

const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Reaktyvi būsena
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
    if (document.getElementById('auto-year')) {
        document.getElementById('auto-year').textContent = new Date().getFullYear();
    }
    
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        showAuthScreen(false);
        setupRealtime();
        await refreshAll();
    } else {
        showAuthScreen(true);
    }
}

// THEME
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

// AUTH
async function login() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value;
    if (!email || !password) return alert('Įveskite duomenis');
    
    state.loading = true;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
        alert('Klaida: ' + error.message);
        state.loading = false;
    } else {
        location.reload();
    }
}

async function logout() {
    state.loading = true;
    await db.auth.signOut();
    localStorage.clear();
    location.reload();
}

// SHIFT MANAGEMENT (Štai ko trūko)
function openOdoModal() {
    const modal = document.getElementById('odo-modal');
    const input = document.getElementById('odo-input');
    if (modal) {
        input.value = '';
        modal.classList.remove('hidden');
    }
}

function closeModals() {
    document.getElementById('odo-modal').classList.add('hidden');
}

async function confirmShiftAction() {
    const odoValue = document.getElementById('odo-input').value;
    if (!odoValue) return alert('Įveskite odometrą');

    state.loading = true;
    try {
        if (!state.activeShift) {
            // START SHIFT
            const { error } = await db.from('finance_shifts').insert({
                user_id: state.user.id,
                start_odo: parseInt(odoValue),
                status: 'active'
            });
            if (error) throw error;
        } else {
            // END SHIFT
            const { error } = await db.from('finance_shifts').update({
                end_odo: parseInt(odoValue),
                status: 'completed',
                end_time: new Date().toISOString()
            }).eq('id', state.activeShift.id);
            if (error) throw error;
        }
        closeModals();
        await refreshAll();
    } catch (err) {
        alert(err.message);
    } finally {
        state.loading = false;
    }
}

// TRANSACTIONS
async function saveTransaction(direction) {
    const amount = parseFloat(prompt(`Įveskite sumą (${direction === 'in' ? 'Pajamos' : 'Išlaidos'}):`));
    if (!amount || isNaN(amount)) return;

    state.loading = true;
    try {
        const { data: asset } = await db.from('finance_assets').select('id').eq('is_liquid', true).limit(1).single();
        if (!asset) throw new Error('Nėra nustatyto turto sąskaitos');

        const { error } = await db.from('finance_transactions').insert({
            user_id: state.user.id,
            asset_id: asset.id,
            amount: amount,
            direction: direction,
            shift_id: state.activeShift ? state.activeShift.id : null
        });
        if (error) throw error;
        await refreshAll();
    } catch (err) {
        alert(err.message);
    } finally {
        state.loading = false;
    }
}

// UI UPDATE LOGIC
function updateUI(key) {
    const $ = (id) => document.getElementById(id);
    if (key === 'loading' && $('loading')) $('loading').classList.toggle('hidden', !state.loading);
    
    if (key === 'summary') {
        if ($('buffer-bar')) $('buffer-bar').style.width = `${state.summary.buffer_pct}%`;
        if ($('runway-val')) $('runway-val').textContent = state.summary.runway_months;
        if ($('stat-liquid')) $('stat-liquid').textContent = `$${Math.round(state.summary.total_liquid).toLocaleString()}`;
    }

    if (key === 'activeShift') {
        const btn = $('shift-btn');
        if (btn) {
            if (state.activeShift) {
                btn.innerHTML = '<i class="fa-solid fa-stop mr-2"></i>END SHIFT';
                btn.classList.replace('bg-teal-500', 'bg-red-500');
                startTimer();
            } else {
                btn.innerHTML = '<i class="fa-solid fa-play mr-2"></i>START SHIFT';
                btn.classList.replace('bg-red-500', 'bg-teal-500');
                stopTimer();
            }
        }
    }
}

// DATA FETCHING
async function refreshAll() {
    const { data: summary } = await db.from('user_financial_summary').select('*').maybeSingle();
    if (summary) state.summary = summary;

    const { data: shift } = await db.from('finance_shifts').select('*').eq('status', 'active').maybeSingle();
    state.activeShift = shift;
}

// TIMER
let timerInterval;
function startTimer() {
    stopTimer();
    const start = new Date(state.activeShift.start_time);
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - start) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        const el = document.getElementById('shift-timer');
        if (el) el.textContent = `${h}:${m}:${s}`;
    }, 1000);
}
function stopTimer() {
    clearInterval(timerInterval);
    const el = document.getElementById('shift-timer');
    if (el) el.textContent = '00:00:00';
}

// NAVIGATION
function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.id === `btn-${tabId}`));
}

function setupRealtime() {
    db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe();
}

function showAuthScreen(show) {
    document.getElementById('auth-screen').classList.toggle('hidden', !show);
    document.getElementById('app-content').classList.toggle('hidden', show);
}

document.addEventListener('DOMContentLoaded', init);
