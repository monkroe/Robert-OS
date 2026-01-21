/*
  PROJECT: ROBERT-OS
  VERSION: 3.1 (Fix: Silent Logout & UI Stability)
*/

// --- 1. KONFIGŪRACIJA ---
const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. PAGALBINĖS FUNKCIJOS ---
const getEl = (id) => document.getElementById(id);

// --- 3. TEMŲ VALDYMAS ---
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
    const theme = localStorage.theme || 'system';
    setTheme(theme, false);

    try {
        const { data: { session }, error } = await db.auth.getSession();
        if (error) throw error;
        
        if (session) {
            switchScreen('app-content');
            loadAllData();
        } else {
            switchScreen('auth-screen');
        }
    } catch (err) {
        // Ignoruojame "aborted" klaidą, kuri atsiranda persikraunant puslapiui
        if (err.message.includes('aborted') || err.name === 'AbortError') {
            console.log("Session request aborted (normal during reload)");
        } else {
            alert("Sistemos klaida: " + err.message);
        }
    }
}

function switchScreen(screenId) {
    const auth = getEl('auth-screen');
    const app = getEl('app-content');
    if (auth) auth.classList.toggle('hidden', screenId !== 'auth-screen');
    if (app) app.classList.toggle('hidden', screenId !== 'app-content');
}

// --- 5. DUOMENŲ KROVIMAS ---
async function loadAllData() {
    await loadVehicles();
    await loadAssets();
}

async function loadVehicles() {
    const select = getEl('vehicle-select');
    if (!select) return;

    try {
        const { data, error } = await db.from('finance_vehicles').select('*').eq('status', 'active');
        if (error) throw error;

        if (data && data.length > 0) {
            select.innerHTML = '<option value="" disabled selected>Pasirinkite mašiną</option>' + 
                data.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        } else {
            select.innerHTML = `<option value="">Nėra automobilių</option>`;
        }
    } catch (err) {
        console.error("Vehicles error:", err);
    }
}

async function loadAssets() {
    const list = getEl('assets-list');
    const totalDisp = getEl('total-balance-display');
    if (!list) return;

    try {
        const { data, error } = await db.from('finance_assets').select('*');
        if (error) throw error;

        let total = 0;
        if (data) {
            list.innerHTML = data.map(a => {
                total += parseFloat(a.cached_balance || 0);
                return `
                    <div class="glass-card p-5 rounded-[2rem] flex justify-between items-center border border-gray-100 dark:border-gray-800 mb-3">
                        <div class="flex flex-col">
                            <span class="label-tiny mb-1 text-[9px] opacity-50 font-black">Account</span>
                            <span class="font-bold text-gray-700 dark:text-gray-300 text-sm">${a.name}</span>
                        </div>
                        <span class="text-lg font-black text-gray-900 dark:text-white">$${a.cached_balance.toFixed(2)}</span>
                    </div>
                `;
            }).join('');
            if (totalDisp) totalDisp.innerText = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }
    } catch (err) {
        console.error("Assets error:", err);
    }
}

// --- 6. PAMAINOS VALDYMAS ---
let timerInterval;

async function startShift() {
    const vSelect = getEl('vehicle-select');
    const odoInput = getEl('start-odometer');
    if (!vSelect || !odoInput) return;

    const vId = vSelect.value;
    const odo = odoInput.value;

    if (!vId) return alert("Pasirinkite automobilį!");
    if (!odo) return alert("Įveskite odometrą!");

    try {
        const { error } = await db.from('finance_shifts').insert([
            { vehicle_id: vId, start_odometer: parseFloat(odo), status: 'active' }
        ]);
        if (error) throw error;

        getEl('pre-shift-form').classList.add('hidden');
        getEl('active-shift-view').classList.remove('hidden');
        
        const badge = getEl('shift-status-badge');
        if (badge) {
            badge.innerText = "Active";
            badge.className = "text-[9px] font-black px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 uppercase tracking-tighter border border-green-500/20";
        }

        getEl('active-vehicle-info').innerText = vSelect.options[vSelect.selectedIndex].text;
        startTimer();
        
    } catch (err) {
        alert("Klaida: " + err.message);
    }
}

function startTimer() {
    let seconds = 0;
    const display = getEl('shift-timer');
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        seconds++;
        const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        if (display) display.innerText = `${hrs}:${mins}:${secs}`;
    }, 1000);
}

// --- 7. AUTENTIFIKACIJA IR NUSTATYMAI ---

async function login() {
    const email = getEl('auth-email').value;
    const pass = getEl('auth-pass').value;
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) alert("Klaida: " + error.message);
    else location.reload();
}

// FIX: Saugesnis atsijungimas
async function logout() {
    try {
        // Pirmiausia bandome atsijungti serveryje
        await db.auth.signOut();
    } catch (err) {
        // Jei naršyklė nutraukia ryšį (abort), tiesiog ignoruojame ir einame toliau
        console.log("Signout connection closed.");
    }
    // Bet kokiu atveju perkrauname puslapį
    location.reload();
}

function toggleSettingsModal() {
    const modal = getEl('settings-modal');
    if (modal) modal.classList.toggle('hidden');
}

window.addEventListener('DOMContentLoaded', init);
