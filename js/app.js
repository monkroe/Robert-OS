import { supabase } from './db.js';
import { state } from './state.js';
import { updateUI, initClocks } from './modules/ui.js';
import { startTimer, stopTimer, openStartModal, openEndModal, togglePause, confirmStart, confirmEnd } from './modules/shifts.js';
import { refreshAudit, openTxModal, confirmTx, setExpType, exportAI } from './modules/finance.js';
import { showToast } from './utils.js';

/**
 * Pagrindinis duomenų atnaujinimas iš DB
 */
async function refreshData() {
    if (!state.user) return;

    try {
        // 1. Aktyvi pamaina
        const { data: active } = await supabase
            .from('finance_shifts')
            .select('*')
            .eq('user_id', state.user.id)
            .eq('status', 'active')
            .maybeSingle();

        // 2. Šiandienos pajamos
        const today = new Date();
        today.setHours(0,0,0,0);
        const { data: todayShifts } = await supabase
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .gte('end_time', today.toISOString());

        const earnedToday = todayShifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;

        // 3. Garažas
        const { data: fleet } = await supabase
            .from('vehicles')
            .select('*')
            .eq('user_id', state.user.id);

        // State update
        state.activeShift = active;
        state.fleet = fleet || [];
        state.stats.today = earnedToday;

        // UI update
        updateUI('all');
        refreshAudit();

        if (active) startTimer();
        else stopTimer();

    } catch (e) {
        console.error("Duomenų krovimo klaida:", e);
    }
}

/**
 * Prisijungimo logika
 */
async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    
    if (!email || !pass) return showToast('Užpildykite laukus!', 'error');
    
    document.getElementById('loading-overlay')?.classList.remove('hidden');
    
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    
    if (error) {
        showToast(error.message, 'error');
        document.getElementById('loading-overlay')?.classList.add('hidden');
    } else {
        location.reload();
    }
}

/**
 * Atsijungimo logika
 */
async function handleLogout() {
    await supabase.auth.signOut();
    location.reload();
}

/**
 * Programėlės inicializacija
 */
async function initApp() {
    const { data: { session } } = await supabase.auth.getSession();
    
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');

    // 1. Tikriname ar vartotojas prisijungęs
    if (!session) {
        authScreen?.classList.remove('hidden');
        appContent?.classList.add('hidden');
        document.getElementById('btn-login')?.addEventListener('click', handleLogin);
        return;
    }

    // 2. Vartotojas prisijungęs - krauname sistemą
    state.user = session.user;
    authScreen?.classList.add('hidden');
    appContent?.classList.remove('hidden');

    // 3. PRISKIRIAME FUNKCIJAS PRIE WINDOW (Kad veiktų HTML onclick)
    window.logout = handleLogout;
    window.openStartModal = openStartModal;
    window.confirmStart = confirmStart;
    window.openEndModal = openEndModal;
    window.confirmEnd = confirmEnd;
    window.handlePause = togglePause;
    window.openTxModal = openTxModal;
    window.confirmTx = confirmTx;
    window.setExpType = setExpType;
    window.exportAI = exportAI;

    // 4. Paleidžiame laikrodžius ir krauname duomenis
    initClocks();
    await refreshData();

    // 5. Klausomės signalų atnaujinimui
    window.addEventListener('refresh-data', refreshData);
    
    // Auto-atnaujinimas kas 30 sekundžių
    setInterval(refreshData, 30000);
}

// Paleidimas
document.addEventListener('DOMContentLoaded', initApp);

export { refreshData };
