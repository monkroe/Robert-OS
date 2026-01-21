/* ROBERT ❤️ OS v6.0 - OPTIMIZED ENGINE */

// ⚠️ SVARBU: Supabase kredencialai turėtų būti .env faile
const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

// === STATE MANAGEMENT ===
const state = {
    activeShiftId: null,
    shiftStartTime: null,
    timerInterval: null,
    txMode: 'in', // 'in' arba 'out'
    user: null
};

// === INITIALIZATION ===
async function init() {
    try {
        updateFooterYear();
        initTheme();
        
        const { data: { session }, error } = await db.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
            state.user = session.user;
            showApp();
            await checkActiveShift();
            await switchTab('cockpit');
        } else {
            showAuth();
        }
    } catch (err) {
        console.error('Init error:', err);
        showAuth();
    }
}

function showApp() {
    $('auth-screen').classList.add('hidden');
    $('app-content').classList.remove('hidden');
}

function showAuth() {
    $('auth-screen').classList.remove('hidden');
    $('app-content').classList.add('hidden');
}

function updateFooterYear() {
    const yearEl = $('auto-year');
    if (yearEl) yearEl.innerText = new Date().getFullYear();
}

// === AUTHENTICATION ===
async function login() {
    const email = $('auth-email').value.trim();
    const pass = $('auth-pass').value;
    
    if (!email || !pass) {
        alert('Įveskite el. paštą ir slaptažodį');
        return;
    }
    
    try {
        const { data, error } = await db.auth.signInWithPassword({
            email,
            password: pass
        });
        
        if (error) throw error;
        
        state.user = data.user;
        showApp();
        await checkActiveShift();
        await switchTab('cockpit');
    } catch (err) {
        console.error('Login error:', err);
        alert('Prisijungimo klaida: ' + err.message);
    }
}

async function logout() {
    try {
        await db.auth.signOut();
        state.user = null;
        state.activeShiftId = null;
        clearTimer();
        localStorage.clear();
        location.reload();
    } catch (err) {
        console.error('Logout error:', err);
    }
}

// === THEME MANAGEMENT ===
function initTheme() {
    const saved = localStorage.getItem('theme') || 'system';
    applyTheme(saved);
}

function setTheme(theme) {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    closeModals();
}

function applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.classList.toggle('dark', isDark);
    } else {
        html.classList.toggle('dark', theme === 'dark');
    }
}

// === TAB MANAGEMENT ===
async function switchTab(tabId) {
    try {
        // Pašaliname visus aktyvius
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        
        // Aktyvuojame naujus
        const tab = $(`tab-${tabId}`);
        const nav = $(`btn-${tabId}`);
        
        if (tab) tab.classList.add('active');
        if (nav) nav.classList.add('active');
        
        // Krauname duomenis
        switch (tabId) {
            case 'cockpit': await refreshCockpit(); break;
            case 'runway': await refreshRunway(); break;
            case 'projection': await refreshProjection(); break;
            case 'vault': await refreshVault(); break;
            case 'audit': await refreshAudit(); break;
        }
    } catch (err) {
        console.error('Tab switch error:', err);
    }
}

// === COCKPIT ===
async function refreshCockpit() {
    try {
        const { data: buf } = await db.from('emergency_buffer_view')
            .select('buffer_pct')
            .maybeSingle();
        
        const pct = buf?.buffer_pct || 0;
        const barEl = $('buffer-bar');
        if (barEl) barEl.style.width = `${pct}%`;
    } catch (err) {
        console.error('Cockpit refresh error:', err);
    }
}

// === SHIFT MANAGEMENT ===
async function checkActiveShift() {
    try {
        const { data, error } = await db.from('finance_active_shift_view')
            .select('*')
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        const btn = $('shift-btn');
        
        if (data) {
            state.activeShiftId = data.id;
            state.shiftStartTime = new Date(data.start_time);
            
            btn.innerText = "Baigti pamainą";
            btn.style.background = "#ef4444";
            startTimer();
        } else {
            state.activeShiftId = null;
            btn.innerText = "Pradėti pamainą";
            btn.style.background = "white";
            clearTimer();
            $('shift-timer').innerText = "00:00:00";
        }
    } catch (err) {
        console.error('Check shift error:', err);
    }
}

function openOdoModal() {
    const modal = $('odo-modal');
    const title = $('odo-title');
    const input = $('odo-input');
    
    if (state.activeShiftId) {
        title.innerText = "Pabaigos odometras";
        input.placeholder = "Galutinė rida";
    } else {
        title.innerText = "Starto odometras";
        input.placeholder = "Pradinė rida";
    }
    
    input.value = '';
    modal.classList.remove('hidden');
}

async function confirmShiftAction() {
    const odo = parseInt($('odo-input').value);
    
    if (!odo || odo < 0) {
        alert('Įveskite tinkamą odometro rodmenį');
        return;
    }
    
    try {
        if (state.activeShiftId) {
            await endShift(odo);
        } else {
            await startShift(odo);
        }
        
        closeModals();
        await checkActiveShift();
        await refreshCockpit();
    } catch (err) {
        console.error('Shift action error:', err);
        alert('Klaida: ' + err.message);
    }
}

async function startShift(odoStart) {
    const { error } = await db.from('finance_shifts').insert({
        user_id: state.user.id,
        start_time: new Date().toISOString(),
        odo_start: odoStart
    });
    
    if (error) throw error;
}

async function endShift(odoEnd) {
    const { error } = await db.from('finance_shifts')
        .update({
            end_time: new Date().toISOString(),
            odo_end: odoEnd
        })
        .eq('id', state.activeShiftId);
    
    if (error) throw error;
}

function startTimer() {
    clearTimer();
    
    state.timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - state.shiftStartTime) / 1000);
        
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        
        $('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function clearTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

// === TRANSACTIONS ===
function openTx(mode) {
    state.txMode = mode;
    $('tx-amount').value = '';
    $('tx-modal').classList.remove('hidden');
}

async function saveTx() {
    const amount = parseFloat($('tx-amount').value);
    
    if (!amount || amount <= 0) {
        alert('Įveskite tinkamą sumą');
        return;
    }
    
    try {
        const { error } = await db.from('finance_transactions').insert({
            user_id: state.user.id,
            shift_id: state.activeShiftId,
            type: state.txMode,
            amount: amount,
            created_at: new Date().toISOString()
        });
        
        if (error) throw error;
        
        closeModals();
        await refreshCockpit();
        await refreshRunway();
    } catch (err) {
        console.error('Save tx error:', err);
        alert('Klaida išsaugant: ' + err.message);
    }
}

// === RUNWAY ===
async function refreshRunway() {
    try {
        const { data: rw } = await db.from('runway_view')
            .select('*')
            .maybeSingle();
        
        const { data: buf } = await db.from('emergency_buffer_view')
            .select('buffer_pct')
            .maybeSingle();
        
        if (rw) {
            $('runway-val').innerText = (rw.runway_months || 0).toFixed(1);
            $('stat-liquid').innerText = `$${Math.round(rw.liquid_cash || 0).toLocaleString()}`;
            $('stat-burn').innerText = `$${Math.round(rw.monthly_burn || 0).toLocaleString()}`;
            $('stat-safety').innerText = `${Math.round(buf?.buffer_pct || 0)}%`;
        }
    } catch (err) {
        console.error('Runway refresh error:', err);
    }
}

// === PROJECTION ===
async function refreshProjection() {
    try {
        const { data } = await db.from('projection_milestones')
            .select('*')
            .order('target_date');
        
        const container = $('eta-container');
        container.innerHTML = data?.length 
            ? data.map(m => `
                <div class="glass-card">
                    <span class="label-tiny">${m.milestone_name}</span>
                    <p class="text-2xl font-bold">${new Date(m.target_date).toLocaleDateString('lt-LT')}</p>
                </div>
            `).join('')
            : '<p class="text-center text-slate-400">Nėra tikslų</p>';
    } catch (err) {
        console.error('Projection error:', err);
    }
}

// === VAULT ===
async function refreshVault() {
    try {
        const { data } = await db.from('assets')
            .select('*')
            .order('created_at', { ascending: false });
        
        const container = $('asset-list');
        container.innerHTML = data?.length
            ? data.map(a => `
                <div class="glass-card">
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="label-tiny">${a.asset_type}</span>
                            <p class="text-xl font-bold">${a.name}</p>
                        </div>
                        <p class="text-2xl font-black text-primary-500">$${a.value?.toLocaleString()}</p>
                    </div>
                </div>
            `).join('')
            : '<p class="text-center text-slate-400">Nėra turtų</p>';
    } catch (err) {
        console.error('Vault error:', err);
    }
}

// === AUDIT ===
async function refreshAudit() {
    try {
        const { data } = await db.from('finance_transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        const container = $('audit-list');
        container.innerHTML = data?.length
            ? data.map(t => `
                <div class="glass-card flex justify-between items-center">
                    <div>
                        <span class="label-tiny">${new Date(t.created_at).toLocaleString('lt-LT')}</span>
                        <p class="font-bold ${t.type === 'in' ? 'text-green-500' : 'text-red-500'}">
                            ${t.type === 'in' ? '+' : '-'}$${t.amount}
                        </p>
                    </div>
                </div>
            `).join('')
            : '<p class="text-center text-slate-400">Nėra transakcijų</p>';
    } catch (err) {
        console.error('Audit error:', err);
    }
}

// === MODALS ===
function toggleSettings() {
    $('settings-modal').classList.toggle('hidden');
}

function closeModals() {
    const modals = ['odo-modal', 'tx-modal', 'settings-modal'];
    modals.forEach(id => {
        const el = $(id);
        if (el) el.classList.add('hidden');
    });
}

// === EVENT LISTENERS ===
document.addEventListener('DOMContentLoaded', init);

// Uždarome modalus ESC klavišu
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
});

// System theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'system') {
        applyTheme('system');
    }
});
