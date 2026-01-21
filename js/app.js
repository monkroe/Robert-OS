// CONFIGURATION
const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM ELEMENTS
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loadingFallback = document.getElementById('loading-fallback');

// SYSTEM INITIALIZATION
async function init() {
    try {
        const { data: { session } } = await db.auth.getSession();
        loadingFallback.style.display = 'none'; // Paslepiame loading

        if (session) {
            document.getElementById('user-display').innerText = session.user.email.split('@')[0];
            showDashboard();
        } else {
            showLogin();
        }
    } catch (err) {
        console.error("System crash:", err);
        alert("Ryšio klaida. Patikrinkite raktus.");
    }
}

// AUTH FUNCTIONS
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else location.reload();
}

async function logout() {
    await db.auth.signOut();
    location.reload();
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
}

async function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadVehicles();
    loadAssets();
}

// DATA LOADING
async function loadVehicles() {
    const { data } = await db.from('finance_vehicles').select('*').eq('status', 'active');
    const select = document.getElementById('vehicle-select');
    if (data && data.length > 0) {
        select.innerHTML = data.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    }
}

async function loadAssets() {
    const { data } = await db.from('finance_assets').select('*');
    const list = document.getElementById('assets-list');
    if (data) {
        list.innerHTML = data.map(a => `
            <div class="glass-card p-4 rounded-xl flex justify-between items-center border-l-4 border-l-green-500 mb-2">
                <span class="text-sm font-medium text-gray-300">${a.name}</span>
                <span class="font-bold text-white text-lg">$${a.cached_balance.toFixed(2)}</span>
            </div>
        `).join('');
    }
}

// SHIFT LOGIC
async function startShift() {
    const vehicleId = document.getElementById('vehicle-select').value;
    const odo = document.getElementById('start-odometer').value;
    
    if (!odo) return alert("Įveskite odometrą!");

    const { error } = await db.from('finance_shifts').insert([
        { vehicle_id: vehicleId, start_odometer: parseFloat(odo), status: 'active' }
    ]);

    if (error) alert(error.message);
    else {
        document.getElementById('pre-shift-form').classList.add('hidden');
        document.getElementById('active-shift-view').classList.remove('hidden');
        const tag = document.getElementById('shift-status-tag');
        tag.innerText = "Active";
        tag.className = "text-[10px] bg-green-900 text-green-400 px-2 py-1 rounded border border-green-500 uppercase tracking-widest";
        document.getElementById('shift-card').classList.add('active-glow');
        startTimer();
    }
}

function startTimer() {
    let seconds = 0;
    setInterval(() => {
        seconds++;
        const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        document.getElementById('shift-timer').innerText = `${hrs}:${mins}:${secs}`;
    }, 1000);
}

// RUN BOOT SEQUENCE
init();
