// --- CONFIGURATION ---
const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';

// --- ELEMENTS ---
const authScreen = document.getElementById('auth-screen');
const appContent = document.getElementById('app-content');
const settingsModal = document.getElementById('settings-modal');

// --- THEME ENGINE ---
function initTheme() {
    const theme = localStorage.theme || 'system';
    setTheme(theme, false);
}

function setTheme(mode, save = true) {
    const html = document.documentElement;
    if (mode === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.classList.toggle('dark', isDark);
        if (save) localStorage.removeItem('theme');
    } else {
        html.classList.toggle('dark', mode === 'dark');
        if (save) localStorage.theme = mode;
    }
    
    // UI Update
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`theme-${mode}`).classList.add('active');
}

// --- INITIALIZE ---
async function init() {
    initTheme();
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        showApp();
    } else {
        showAuth();
    }
}

// --- AUTH FUNCTIONS ---
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else location.reload();
}

function logout() {
    db.auth.signOut().then(() => location.reload());
}

function showAuth() {
    authScreen.classList.remove('hidden');
    appContent.classList.add('hidden');
}

function showApp() {
    authScreen.classList.add('hidden');
    appContent.classList.remove('hidden');
    loadData();
}

// --- DATA LOADING ---
async function loadData() {
    loadVehicles();
    loadAssets();
}

async function loadVehicles() {
    const { data } = await db.from('finance_vehicles').select('*').eq('status', 'active');
    const select = document.getElementById('vehicle-select');
    if (data) select.innerHTML = data.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
}

async function loadAssets() {
    const { data } = await db.from('finance_assets').select('*');
    const list = document.getElementById('assets-list');
    let total = 0;
    
    if (data) {
        list.innerHTML = data.map(a => {
            total += a.cached_balance;
            return `
                <div class="glass-card p-5 rounded-2xl flex justify-between items-center shadow-sm border border-gray-200 dark:border-gray-800">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-primary-500/10 text-primary-500 rounded-full flex items-center justify-center">
                            <i class="fa-solid fa-wallet"></i>
                        </div>
                        <span class="font-bold text-gray-700 dark:text-gray-300">${a.name}</span>
                    </div>
                    <span class="text-xl font-black text-gray-900 dark:text-white tracking-tight">$${a.cached_balance.toFixed(2)}</span>
                </div>
            `;
        }).join('');
        document.getElementById('total-balance-display').innerText = `$${total.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    }
}

// --- SHIFT ENGINE ---
async function startShift() {
    const vId = document.getElementById('vehicle-select').value;
    const odo = document.getElementById('start-odometer').value;
    if (!odo) return alert("Įveskite odometrą");

    const { error } = await db.from('finance_shifts').insert([{ vehicle_id: vId, start_odometer: parseFloat(odo), status: 'active' }]);
    if (error) alert(error.message);
    else {
        document.getElementById('pre-shift-form').classList.add('hidden');
        document.getElementById('active-shift-view').classList.remove('hidden');
        document.getElementById('shift-card').classList.add('border-primary-500', 'bg-primary-500/5');
        startTimer();
    }
}

function startTimer() {
    let sec = 0;
    setInterval(() => {
        sec++;
        const h = String(Math.floor(sec/3600)).padStart(2,'0');
        const m = String(Math.floor((sec%3600)/60)).padStart(2,'0');
        const s = String(sec%60).padStart(2,'0');
        document.getElementById('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function toggleSettingsModal() {
    settingsModal.classList.toggle('hidden');
}

init();
