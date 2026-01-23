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

        // 2. Gauname automobilį (jei yra aktyvi pamaina)
        let activeVehicle = null;
        if (active?.vehicle_id) {
            const { data: v } = await supabase
                .from('vehicles')
                .select('*')
                .eq('id', active.vehicle_id)
                .single();
            activeVehicle = v;
        }

        // 3. Gauname šiandienos statistiką (Pajamos)
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const { data: todayShifts } = await supabase
            .from('finance_shifts')
            .select('gross_earnings')
            .eq('user_id', state.user.id)
            .gte('end_time', today.toISOString());

        const earnedToday = todayShifts?.reduce((sum, s) => sum + (s.gross_earnings || 0), 0) || 0;

        // 4. Gauname garažą (automobilius)
        const { data: fleet } = await supabase
            .from('vehicles')
            .select('*')
            .eq('user_id', state.user.id);

        // 5. Atnaujiname globalią būseną (State)
        state.activeShift = active;
        state.activeVehicle = activeVehicle;
        state.fleet = fleet || [];
        state.stats.today = earnedToday;

        // 6. UI Atnaujinimas
        updateUI('all');
        refreshAudit(); // Atnaujiname istorijos sąrašą

        // Valdome laikmatį
        if (active) {
            startTimer();
        } else {
            stopTimer();
        }

    } catch (e) {
        console.error("Klaida refreshData:", e);
    }
}

// --- PROGRAMĖLĖS STARTAS ---
async function initApp() {
    // Tikriname sesiją
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        // Jei nėra sesijos, nukreipiame į login (jei turi tokį puslapį)
        // window.location.href = 'login.html';
        console.log("Vartotojas neprisijungęs");
        return;
    }

    state.user = session.user;

    // Paleidžiame laikrodžius (CST / LT)
    initClocks();

    // Pirminis duomenų užkrovimas
    await refreshData();

    // Klausomės signalų iš kitų modulių (pvz., kai baigiama pamaina)
    window.addEventListener('refresh-data', refreshData);

    // Automatinis atnaujinimas kas 30s (tik pajamoms ir būsenai fone)
    setInterval(refreshData, 30000);
}

// Paleidžiame viską, kai DOM paruoštas
document.addEventListener('DOMContentLoaded', initApp);

export { refreshData };
