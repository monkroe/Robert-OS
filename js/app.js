/* ROBERT ❤️ OS v6.1.3 - THE FINAL FIX */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
let state = { activeShiftId: null, shiftStartTime: null, timerInterval: null, txMode: 'in', user: null };

async function init() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        $('auth-screen').classList.add('hidden');
        $('app-content').classList.remove('hidden');
        await checkActiveShift();
        await switchTab('cockpit');
    } else {
        $('auth-screen').classList.remove('hidden');
    }
}

async function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if ($(`tab-${tabId}`)) $(`tab-${tabId}`).classList.add('active');
    if ($(`btn-${tabId}`)) $(`btn-${tabId}`).classList.add('active');
    
    // Refresh data only when needed
    if (tabId === 'cockpit') await refreshCockpit();
    if (tabId === 'runway') await refreshRunway();
    if (tabId === 'vault') await refreshVault();
    if (tabId === 'audit') await refreshAudit();
}

async function checkActiveShift() {
    try {
        const { data, error } = await db.from('finance_active_shift_view').select('*').maybeSingle();
        if (error) throw error;

        const btn = $('shift-btn');
        const label = $('active-vehicle-label');

        if (data) {
            state.activeShiftId = data.id;
            state.shiftStartTime = new Date(data.start_time);
            btn.innerText = "Baigti pamainą";
            btn.style.background = "#ef4444";
            if (label) label.innerText = `Auto: ${data.vehicle_name || 'Aktyvus'}`;
            startTimer();
        } else {
            state.activeShiftId = null;
            btn.innerText = "Start Shift";
            btn.style.background = "#14b8a6";
            if (label) label.innerText = "System Buffer";
            if (state.timerInterval) clearInterval(state.timerInterval);
            $('shift-timer').innerText = "00:00:00";
        }
    } catch (err) {
        console.error("Check shift failed:", err);
    }
}

async function openOdoModal() {
    const vGroup = $('vehicle-selection-group');
    const select = $('vehicle-select');
    const input = $('odo-input');
    
    input.value = '';

    if (state.activeShiftId) {
        vGroup.classList.add('hidden');
        $('odo-title').innerText = "Baigti pamainą";
    } else {
        vGroup.classList.remove('hidden');
        $('odo-title').innerText = "Pradėti pamainą";
        
        // Load vehicles
        const { data: v, error } = await db.from('vehicles').select('*').order('name');
        if (v && v.length > 0) {
            select.innerHTML = v.map(item => `<option value="${item.id}">${item.name} (${item.plate})</option>`).join('');
        } else {
            select.innerHTML = `<option value="">Nėra automobilių!</option>`;
        }
    }
    $('odo-modal').classList.remove('hidden');
}

async function confirmShiftAction() {
    const odo = parseInt($('odo-input').value);
    const vehicleId = $('vehicle-select').value;

    if (isNaN(odo) || odo < 0) return alert("Prašome įvesti teisingą ridą.");

    try {
        if (!state.activeShiftId) {
            // START
            if (!vehicleId) return alert("Pasirinkite automobilį.");
            
            const { error } = await db.from('finance_shifts').insert([{
                user_id: state.user.id,
                vehicle_id: vehicleId,
                start_odometer: odo,
                status: 'active'
            }]);
            if (error) throw error;
        } else {
            // END
            const { error } = await db.from('finance_shifts')
                .update({
                    end_odometer: odo,
                    status: 'completed',
                    end_time: new Date().toISOString()
                })
                .eq('id', state.activeShiftId);
            if (error) throw error;
        }
        
        closeModals();
        await checkActiveShift();
    } catch (err) {
        alert("Klaida: " + err.message);
    }
}

function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - state.shiftStartTime) / 1000);
        const h = String(Math.floor(diff/3600)).padStart(2,'0');
        const m = String(Math.floor((diff%3600)/60)).padStart(2,'0');
        const s = String(diff%60).padStart(2,'0');
        $('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

// OTHER REFRESH FUNCTIONS
async function refreshCockpit() {
    const { data } = await db.from('emergency_buffer_view').select('buffer_pct').maybeSingle();
    if (data) $('buffer-bar').style.width = `${data.buffer_pct}%`;
}

async function refreshRunway() {
    const { data: rw } = await db.from('runway_view').select('*').maybeSingle();
    if (rw) {
        $('runway-val').innerText = rw.runway_months || '0.0';
        $('stat-liquid').innerText = `$${Math.round(rw.liquid_cash).toLocaleString()}`;
        $('stat-burn').innerText = `$${Math.round(rw.monthly_burn).toLocaleString()}`;
    }
}

async function login() {
    const { error } = await db.auth.signInWithPassword({ 
        email: $('auth-email').value, 
        password: $('auth-pass').value 
    });
    if (error) alert(error.message); else location.reload();
}

function logout() { db.auth.signOut(); localStorage.clear(); location.reload(); }
function toggleSettings() { $('settings-modal').classList.toggle('hidden'); }
function closeModals() { ['odo-modal', 'settings-modal'].forEach(id => $(id).classList.add('hidden')); }
function initTheme() { document.documentElement.classList.add('dark'); }

window.addEventListener('DOMContentLoaded', init);
