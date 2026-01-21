/* ROBERT OS v3.6 - Flexible Compliance Edition 
   Logic: 12h Legal Limit (Warn) | 16h Absolute Max (Force Close)
*/

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LEGAL_LIMIT_HOURS = 12; // Teisinis limitas (Illinois/Chicago)
const ABSOLUTE_MAX_HOURS = 16; // Saugiklis nuo klaidų

const getEl = (id) => document.getElementById(id);
let activeShiftId = null;
let timerInterval;
let shiftStartTime = null;

async function init() {
    const theme = localStorage.theme || 'system';
    setTheme(theme, false);
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        getEl('auth-screen').classList.add('hidden');
        getEl('app-content').classList.remove('hidden');
        await loadAllData();
        await checkActiveShift(); 
    } else {
        getEl('auth-screen').classList.remove('hidden');
    }
}

async function checkActiveShift() {
    const { data } = await db.from('finance_shifts')
        .select('*, finance_vehicles(name)')
        .eq('status', 'active')
        .order('start_time', { ascending: false }).limit(1).single();

    if (data) {
        const startTime = new Date(data.start_time);
        const now = new Date();
        const diffHours = (now - startTime) / (1000 * 60 * 60);

        // Jei viršytas ABSOLIUTUS limitas (16h), vadinasi pamiršai išjungti
        if (diffHours > ABSOLUTE_MAX_HOURS) {
            await forceCloseShift(data.id);
            return;
        }

        activeShiftId = data.id;
        shiftStartTime = startTime;
        getEl('active-vehicle-info').innerText = data.finance_vehicles.name;
        getEl('pre-shift-form').classList.add('hidden');
        getEl('active-shift-view').classList.remove('hidden');
        startTimerLogic();
    }
}

function startTimerLogic() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = new Date();
        const diffInSeconds = Math.floor((now - shiftStartTime) / 1000);
        const diffInHours = diffInSeconds / 3600;

        const hrs = String(Math.floor(diffInSeconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((diffInSeconds % 3600) / 60)).padStart(2, '0');
        const secs = String(diffInSeconds % 60).padStart(2, '0');
        
        const timerEl = getEl('shift-timer');
        const badge = getEl('shift-status-badge');

        if (timerEl) {
            timerEl.innerText = `${hrs}:${mins}:${secs}`;
            
            // --- DINAMINĖS BŪSENOS ---
            if (diffInHours >= LEGAL_LIMIT_HOURS) {
                // VIRŠVALANDŽIAI (Po 12 valandų)
                timerEl.className = "text-6xl font-black font-mono tracking-tighter text-red-500";
                if (badge) {
                    badge.innerText = "OVERTIME";
                    badge.className = "text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 uppercase tracking-tighter border border-red-500/20";
                }
            } else if (diffInHours >= LEGAL_LIMIT_HOURS - 1) {
                // PERSPĖJIMAS (Paskutinė valanda, nuo 11:00)
                timerEl.className = "text-6xl font-black font-mono tracking-tighter text-orange-500";
                if (badge) badge.innerText = "LIMIT NEAR";
            } else {
                // NORMALUS DARBAS
                timerEl.className = "text-6xl font-black font-mono tracking-tighter text-primary-500";
                if (badge) badge.innerText = "ACTIVE";
            }
        }
    }, 1000);
}

async function forceCloseShift(shiftId) {
    await db.from('finance_shifts').update({ 
        status: 'force_closed', end_time: new Date().toISOString(),
        description: 'Priverstinis uždarymas: viršytas saugumo limitas (16h)'
    }).eq('id', shiftId);
    alert("⚠️ Automatinis saugumo uždarymas. Pamaina viršijo 16 valandų.");
    location.reload();
}

/* ... Likusios funkcijos (startShift, completeShift, loadAllData ir t.t.) lieka tokios pačios kaip v3.5 ... */
