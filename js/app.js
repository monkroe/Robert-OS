/*
  PROJECT: ROBERT-OS
  VERSION: 2.7 (Diagnostic Edition)
*/

// --- 1. KONFIGŪRACIJA ---
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

// --- 3. TEMŲ VALDYMAS ---
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
}

// --- 4. SISTEMOS STARTAS ---
async function init() {
    initTheme();
    try {
        const { data: { session }, error } = await db.auth.getSession();
        if (error) throw error;
        
        if (session) {
            showApp();
        } else {
            showAuth();
        }
    } catch (err) {
        alert("Sistemos starto klaida: " + err.message);
    }
}

// --- 5. AUTENTIFIKACIJA ---
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) alert("Prisijungimo klaida: " + error.message);
    else location.reload();
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
    loadVehicles();
    loadAssets();
}

async function loadVehicles() {
    console.log("Kraunamas transportas...");
    try {
        const { data, error } = await db.from('finance_vehicles').select('*');
        
        if (error) {
            vehicleSelect.innerHTML = `<option value="">Klaida: ${error.message}</option>`;
            alert("DB Klaida (Vehicles): " + error.message);
            return;
        }

        if (data && data.length > 0) {
            vehicleSelect.innerHTML = '<option value="" disabled selected>Pasirinkite mašiną</option>' + 
                data.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        } else {
            vehicleSelect.innerHTML = `<option value="">Nėra rasta mašinų (RLS?)</option>`;
            alert("Dėmesio: Mašinų rasta 0. Patikrinkite SQL Update žingsnį.");
        }
    } catch (err) {
        alert("Kritinė krovimo klaida: " + err.message);
    }
}

async function loadAssets() {
    try {
        const { data, error } = await db.from('finance_assets').select('*');
        let total = 0;
        
        if (error) {
            assetsList.innerHTML = `<p class="text-red-500 text-xs">Klaida: ${error.message}</p>`;
            return;
        }

        if (data) {
            assetsList.innerHTML = data.map(a => {
                total += a.cached_balance;
                return `
                    <div class="glass-card p-5 rounded-3xl flex justify-between items-center border border-gray-100 dark:border-gray-800 shadow-sm mb-3">
                        <div class="flex flex-col">
                            <span class="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Account</span>
                            <span class="font-bold text-gray-900 dark:text-white">${a.name}</span>
                        </div>
                        <span class="text-xl font-black text-gray-900 dark:text-white">$${a.cached_balance.toFixed(2)}</span>
                    </div>
                `;
            }).join('');
            totalBalanceDisplay.innerText = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }
    } catch (err) {
        console.error("Assets load error:", err);
    }
}

// --- 7. PAMAINOS VALDYMAS ---
async function startShift() {
    const vId = vehicleSelect.value;
    const odo = document.getElementById('start-odometer').value;

    if (!vId) return alert("Pasirinkite automobilį!");
    if (!odo) return alert("Įveskite odometrą!");

    const { error } = await db.from('finance_shifts').insert([
        { vehicle_id: vId, start_odometer: parseFloat(odo), status: 'active' }
    ]);

    if (error) alert("Klaida pradedant pamainą: " + error.message);
    else location.reload();
}

function toggleSettingsModal() {
    settingsModal.classList.toggle('hidden');
}

// Startuojam
init();
