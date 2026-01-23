import { supabase } from './db.js';
import { state } from './state.js';
import { updateUI, initClocks } from './modules/ui.js';
import { startTimer, stopTimer } from './modules/shifts.js';
import { refreshAudit } from './modules/finance.js';
import { showToast } from './utils.js';

// --- PAGRINDINĖ DUOMENŲ UŽKROVIMO FUNKCIJA ---
async function refreshData() {
    if (!state.user) return;

    try {
        // 1. Gauname aktyvią pamainą
        const { data: active } = await supabase
            .from('finance_shifts')
            .select('*')
            .eq('user_id', state.user.id)
            .eq('status', 'active')
            .maybeSingle();

        // 2. Gauname automobilį
        let activeVehicle = null;
        if (active?.vehicle_id) {
            const { data: v } = await supabase
                .from('vehicles')
                .select('*')
                .eq('id', active.vehicle_id)
                .single();
            activeVehicle = v;
        }

        // 3. Šiandienos statistika (skaičiuojame pabaigtas pamainas)
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const { data: todayShifts } = await supabase
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .gte('end_time', today.toISOString());

        const earnedToday = todayShifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;

        // 4. Garažas
        const { data: fleet } = await supabase
            .from('vehicles')
            .select('*')
            .eq('user_id', state.user.id);

        // 5. State atnaujinimas
        state.activeShift = active;
        state.activeVehicle = activeVehicle;
        state.fleet = fleet || [];
        state.stats.today = earnedToday;

        // 6. UI atnaujinimas
        updateUI('all');
        refreshAudit();

        if (active) startTimer();
        else stopTimer();

    } catch (e) {
        console.error("Klaida refreshData:", e);
    }
}

// --- AUTENTIFIKACIJA ---
async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    
    if (!email || !pass) return showToast('Įveskite duomenis', 'error');
    
    document.getElementById('loading-overlay')?.classList.remove('hidden');
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    
    if (error) {
        showToast(error.message, 'error');
        document.getElementById('loading-overlay')?.classList.add('hidden');
    } else {
        location.reload(); // Saugiausia tiesiog perkrauti po login
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    location.reload();
}

// --- PROGRAMĖLĖS STARTAS ---
async function initApp() {
    const { data: { session } } = await supabase.auth.getSession();
    
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');

    if (!session) {
        // Rodyti Login ekraną
        authScreen?.classList.remove('hidden');
        appContent?.classList.add('hidden');
        
        // Prikergiame prisijungimo mygtuką
        document.getElementById('btn-login')?.addEventListener('click', handleLogin);
        return;
    }

    // Vartotojas prisijungęs
    state.user = session.user;
    authScreen?.classList.add('hidden');
    appContent?.classList.remove('hidden');

    // Globalios funkcijos (kad veiktų senas onclick="logout()")
    window.logout = handleLogout;

    initClocks();
    await refreshData();

    window.addEventListener('refresh-data', refreshData);
    setInterval(refreshData, 30000);
}

document.addEventListener('DOMContentLoaded', initApp);

export { refreshData };
