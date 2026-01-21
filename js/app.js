/*
  PROJECT: ROBERT-OS
  VERSION: 2.8 (Self-Healing Edition)
*/

// --- 1. KONFIGŪRACIJA ---
const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. SAUGUS ELEMENTŲ GAVIMAS ---
// Ši funkcija neleis sistemai lūžti, jei ko nors trūks
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

// --- 4. PAGRINDINĖ LOGIKA ---
async function init() {
    // Patikriname, ar esame tamsiame režime
    const theme = localStorage.theme || 'system';
    setTheme(theme, false);

    try {
        const { data: { session }, error } = await db.auth.getSession();
        if (error) throw error;
        
        if (session) {
            updateUserUI(session.user);
            switchScreen('app-content'); // Rodome pagrindinį turinį
            loadAllData();
        } else {
            switchScreen('auth-screen'); // Rodome loginą
        }
    } catch (err) {
        console.error("Start error:", err);
        // Jei matai šį alertą, vadinasi problema su Supabase ryšiu
        alert("Ryšio klaida: " + err.message);
    }
}

// SAUGUS EKRANŲ PERJUNGIMAS
function switchScreen(screenId) {
    const auth = getEl('auth-screen');
    const app = getEl('app-content');
    
    // Jei randa auth ekraną, jį valdo
    if (auth) {
        auth.style.display = (screenId === 'auth-screen') ? 'flex' : 'none';
        auth.classList.toggle('hidden', screenId !== 'auth-screen');
    }
    
    // Jei randa app turinį, jį valdo
    if (app) {
        app.classList.toggle('hidden', screenId !== 'app-content');
    }
}

function updateUserUI(user) {
    const display = getEl('user-display');
    if (display) display.innerText = user.email.split('@')[0].toUpperCase();
}

// --- 5. DUOMENŲ KROVIMAS ---
async function loadAllData() {
    loadVehicles();
    loadAssets();
}

async function loadVehicles() {
    const select = getEl('vehicle-select');
    if (!select) return;

    const { data, error } = await db.from('finance_vehicles').select('*');
    if (error) {
        select.innerHTML = `<option>DB Klaida</option>`;
        return;
    }

    if (data && data.length > 0) {
        select.innerHTML = '<option value="" disabled selected>Pasirinkite mašiną</option>' + 
            data.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    } else {
        select.innerHTML = `<option value="">Nėra automobilių</option>`;
    }
}

async function loadAssets() {
    const list = getEl('assets-list');
    const totalDisp = getEl('total-balance-display');
    if (!list) return;

    const { data, error } = await db.from('finance_assets').select('*');
    let total = 0;
    
    if (data) {
        list.innerHTML = data.map(a => {
            total += a.cached_balance;
            return `
                <div class="glass-card p-5 rounded-3xl flex justify-between items-center border border-gray-100 dark:border-gray-800 mb-3">
                    <span class="font-bold text-gray-700 dark:text-gray-300">${a.name}</span>
                    <span class="text-xl font-black text-gray-900 dark:text-white">$${a.cached_balance.toFixed(2)}</span>
                </div>
            `;
        }).join('');
        if (totalDisp) totalDisp.innerText = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
}

// --- 6. AUTENTIFIKACIJA ---
async function login() {
    // Svarbu: tavo HTML faile ID turi būti 'email' ir 'password'
    const emailEl = getEl('email') || getEl('auth-email');
    const passEl = getEl('password') || getEl('auth-pass');
    
    if (!emailEl || !passEl) return alert("Klaida: nerasti įvesties laukai HTML!");

    const { error } = await db.auth.signInWithPassword({ 
        email: emailEl.value, 
        password: passEl.value 
    });

    if (error) alert("Klaida: " + error.message);
    else location.reload();
}

async function logout() {
    await db.auth.signOut();
    location.reload();
}

// Užtikriname, kad init pasileis tik tada, kai visas HTML bus užkrautas
window.addEventListener('DOMContentLoaded', init);
