/*
  PROJECT: ROBERT-OS (Gig-to-Wealth)
  VERSION: 2.6 (Unified Logic)
  DESCRIPTION: Pagrindinis logikos failas su temų valdymu ir Supabase integracija.
*/

// --- 1. KONFIGŪRACIJA (Įrašyk savo duomenis) ---
const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. UI ELEMENTAI ---
const authScreen = document.getElementById('auth-screen');
const appContent = document.getElementById('app-content');
const settingsModal = document.getElementById('settings-modal');
const vehicleSelect = document.getElementById('vehicle-select');
const totalBalanceDisplay = document.getElementById('total-balance-display');
const assetsList = document.getElementById('assets-list');

// --- 3. TEMŲ VALDYMAS (Iš tavo Crypto Tracker) ---
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
    
    // Atnaujiname mygtukų stilių nustatymuose
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active', 'border-primary-500', 'bg-primary-500/10');
    });
    const activeBtn = document.getElementById(`theme-${mode}`);
    if (activeBtn) activeBtn.classList.add('active', 'border-primary-500', 'bg-primary-500/10');
}

// --- 4. SISTEMOS STARTAS ---
async function init() {
    initTheme();
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        showApp();
    } else {
        showAuth();
    }
}

// --- 5. AUTENTIFIKACIJA ---
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await db.auth.signInWithPassword({ email, password });
    
    if (error) {
        alert("Klaida: " + error.message);
    } else {
        location.reload();
    }
}

async function logout() {
    await db.auth.signOut();
    location.reload();
}

function showAuth() {
    authScreen.classList.remove('hidden');
    appContent.classList.add('hidden');
}

function showApp() {
    authScreen.classList.add('hidden');
    appContent.classList.remove('hidden');
    loadAllData();
}

// --- 6. DUOMENŲ KROVIMAS ---
async function loadAllData() {
    await Promise.all([
        loadVehicles(),
        loadAssets()
    ]);
}

async function loadVehicles() {
    const { data, error } = await db.from('finance_vehicles').select('*').eq('status', 'active');
    
    if (error) {
        console.error("Klaida kraunant transportą:", error);
        vehicleSelect.innerHTML = `<option value="">Klaida duomenų bazėje</option>`;
        return;
    }

    if (data && data.length > 0) {
        vehicleSelect.innerHTML = '<option value="" disabled selected>Pasirinkite mašiną</option>' + 
            data.map(v => `<option value="${v.id}">${v.name} (${v.rental_provider || 'Sava'})</option>`).join('');
    } else {
        vehicleSelect.innerHTML = `<option value="">Nėra aktyvių mašinų</option>`;
    }
}

async function loadAssets() {
    const { data, error } = await db.from('finance_assets').select('*');
    let total = 0;
    
    if (error) {
        assetsList.innerHTML = `<p class="text-red-500 text-xs">Nepavyko užkrauti sąskaitų</p>`;
        return;
    }

    if (data) {
        assetsList.innerHTML = data.map(a => {
            total += a.cached_balance;
            return `
                <div class="glass-card p-5 rounded-[1.5rem] flex justify-between items-center border border-gray-100 dark:border-gray-800/50 shadow-sm">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-primary-500">
                            <i class="fa-solid fa-wallet text-xl"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-none mb-1">Account</span>
                            <span class="font-bold text-gray-900 dark:text-white">${a.name}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-xl font-black text-gray-900 dark:text-white">$${a.cached_balance.toFixed(2)}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        totalBalanceDisplay.innerText = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// --- 7. PAMAINOS VALDYMAS ---
async function startShift() {
    const vId = vehicleSelect.value;
    const odo = document.getElementById('start-odometer').value;

    if (!vId) return alert("Pirmiausia pasirinkite automobilį!");
    if (!odo) return alert("Įveskite pradinį odometrą!");

    const { error } = await db.from('finance_shifts').insert([
        { vehicle_id: vId, start_odometer: parseFloat(odo), status: 'active' }
    ]);

    if (error) {
        alert("Nepavyko pradėti pamainos: " + error.message);
    } else {
        // UI pasikeitimas pradėjus pamainą
        document.getElementById('pre-shift-form').classList.add('hidden');
        document.getElementById('active-shift-view').classList.remove('hidden');
        document.getElementById('shift-status-badge').innerText = "Active";
        document.getElementById('shift-status-badge').className = "text-[9px] font-black px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 uppercase tracking-tighter border border-green-500/20";
        document.getElementById('shift-card').classList.add('ring-2', 'ring-primary-500/50');
        
        startTimer();
    }
}

function startTimer() {
    let seconds = 0;
    const timerDisplay = document.getElementById('shift-timer');
    
    setInterval(() => {
        seconds++;
        const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        timerDisplay.innerText = `${hrs}:${mins}:${secs}`;
    }, 1000);
}

// --- 8. MODALŲ VALDYMAS ---
function toggleSettingsModal() {
    settingsModal.classList.toggle('hidden');
}

// Paleidžiame sistemą
init();
