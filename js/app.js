/* ROBERT ❤️ OS v6.0.2 - PRODUCTION ENGINE */

const SUPABASE_URL = 'https://sopcisskptiqlllehhgb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let state = { 
    activeShiftId: null, 
    shiftStartTime: null, 
    timerInterval: null, 
    txMode: 'in', 
    user: null 
};

// ==============================================
// INITIALIZATION
// ==============================================

async function init() {
    try {
        // Footer year
        const yearEl = $('auto-year');
        if (yearEl) yearEl.innerText = new Date().getFullYear();
        
        // Theme
        initTheme();

        // Auth check
        const { data: { session }, error } = await db.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
            state.user = session.user;
            $('auth-screen').classList.add('hidden');
            $('app-content').classList.remove('hidden');
            
            // Ensure user has settings
            await ensureUserSettings();
            
            await checkActiveShift();
            await switchTab('cockpit');
        } else {
            $('auth-screen').classList.remove('hidden');
        }
    } catch (err) {
        console.error('Init error:', err);
        $('auth-screen').classList.remove('hidden');
    }
}

async function ensureUserSettings() {
    const { data, error } = await db
        .from('finance_settings')
        .select('user_id')
        .eq('user_id', state.user.id)
        .maybeSingle();
    
    if (!data) {
        await db.from('finance_settings').insert({
            user_id: state.user.id,
            monthly_burn: 2500,
            emergency_buffer_target: 10000
        });
    }
}

// ==============================================
// AUTHENTICATION
// ==============================================

async function login() {
    try {
        const email = $('auth-email').value.trim();
        const pass = $('auth-pass').value;
        
        if (!email || !pass) {
            return alert('Įveskite el. paštą ir slaptažodį');
        }
        
        const { data, error } = await db.auth.signInWithPassword({ 
            email, 
            password: pass 
        });
        
        if (error) throw error;
        
        state.user = data.user;
        location.reload();
    } catch (err) {
        console.error('Login error:', err);
        alert('Klaida: ' + err.message);
    }
}

async function logout() {
    try {
        await db.auth.signOut();
        localStorage.clear();
        location.reload();
    } catch (err) {
        console.error('Logout error:', err);
    }
}

// ==============================================
// THEME MANAGEMENT
// ==============================================

function initTheme() {
    const saved = localStorage.getItem('theme') || 'system';
    applyTheme(saved);
}

function setTheme(mode) {
    localStorage.setItem('theme', mode);
    applyTheme(mode);
    closeModals();
}

function applyTheme(mode) {
    const html = document.documentElement;
    
    if (mode === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.classList.toggle('dark', isDark);
    } else {
        html.classList.toggle('dark', mode === 'dark');
    }
}

// ==============================================
// TAB NAVIGATION
// ==============================================

async function switchTab(tabId) {
    try {
        // Remove all active states
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        
        // Activate new tab
        const tab = $(`tab-${tabId}`);
        const nav = $(`btn-${tabId}`);
        
        if (tab) tab.classList.add('active');
        if (nav) nav.classList.add('active');

        // Load data
        switch(tabId) {
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

// ==============================================
// COCKPIT
// ==============================================

async function refreshCockpit() {
    try {
        const { data } = await db
            .from('emergency_buffer_view')
            .select('buffer_pct')
            .maybeSingle();
        
        if (data && $('buffer-bar')) {
            const pct = Math.min(Math.max(data.buffer_pct || 0, 0), 100);
            $('buffer-bar').style.width = `${pct}%`;
            
            // Color coding
            if (pct > 80) $('buffer-bar').style.background = 'linear-gradient(90deg, #14b8a6, #10b981)';
            else if (pct > 40) $('buffer-bar').style.background = 'linear-gradient(90deg, #f59e0b, #eab308)';
            else $('buffer-bar').style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        }
    } catch (err) {
        console.error('Cockpit refresh error:', err);
    }
}

// ==============================================
// RUNWAY
// ==============================================

async function refreshRunway() {
    try {
        const { data: rw } = await db
            .from('runway_view')
            .select('*')
            .eq('user_id', state.user.id)
            .maybeSingle();
        
        const { data: buf } = await db
            .from('emergency_buffer_view')
            .select('buffer_pct')
            .eq('user_id', state.user.id)
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

// ==============================================
// PROJECTION
// ==============================================

async function refreshProjection() {
    try {
        const { data: nw } = await db
            .from('total_net_worth_view')
            .select('total_net_worth')
            .eq('user_id', state.user.id)
            .maybeSingle();
        
        const container = $('eta-container');
        const netWorth = parseFloat(nw?.total_net_worth || 0);
        
        container.innerHTML = `
            <div class="glass-card text-center py-10">
                <span class="label-tiny">Total Net Worth</span>
                <p class="text-5xl font-black text-teal-500 my-4">$${netWorth.toLocaleString()}</p>
                <p class="text-sm text-slate-500 dark:text-slate-400">Visas turtas</p>
            </div>
            <div class="glass-card text-center">
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">Tikslų sistema - netrukus</p>
                <p class="text-xs opacity-50">Planuojama v6.1</p>
            </div>
        `;
    } catch (err) {
        console.error('Projection error:', err);
        $('eta-container').innerHTML = '<p class="text-center text-slate-400">Klaida įkeliant duomenis</p>';
    }
}

// ==============================================
// VAULT
// ==============================================

async function refreshVault() {
    try {
        const { data } = await db
            .from('investment_portfolio_view')
            .select('*')
            .eq('user_id', state.user.id)
            .order('market_value', { ascending: false });
        
        const container = $('asset-list');
        
        if (data && data.length > 0) {
            container.innerHTML = data.map(a => `
                <div class="glass-card">
                    <div class="flex justify-between items-center">
                        <div class="text-left">
                            <p class="label-tiny">${a.asset_type.toUpperCase()}</p>
                            <p class="font-bold text-lg">${a.symbol}</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400">${parseFloat(a.quantity).toFixed(4)} @ $${parseFloat(a.current_price).toFixed(2)}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-black text-teal-500 text-2xl">$${parseFloat(a.market_value).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="glass-card text-center text-slate-400 py-10"><p>Nėra investicijų</p><p class="text-xs mt-2 opacity-50">Pridėkite pirmuosius aktyvus</p></div>';
        }
    } catch (err) {
        console.error('Vault error:', err);
        $('asset-list').innerHTML = '<p class="text-center text-red-400">Klaida įkeliant duomenis</p>';
    }
}

// ==============================================
// AUDIT
// ==============================================

async function refreshAudit() {
    try {
        const { data } = await db
            .from('finance_transactions')
            .select('*')
            .eq('user_id', state.user.id)
            .order('date', { ascending: false })
            .limit(20);
        
        const container = $('audit-list');
        
        if (data && data.length > 0) {
            container.innerHTML = data.map(t => `
                <div class="glass-card p-4">
                    <div class="flex justify-between items-center">
                        <div class="text-left">
                            <p class="label-tiny">${new Date(t.date).toLocaleDateString('lt-LT')}</p>
                            <p class="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase">${t.source || 'manual'}</p>
                        </div>
                        <p class="font-black text-xl ${t.direction === 'in' ? 'text-teal-500' : 'text-red-400'}">
                            ${t.direction === 'in' ? '+' : '-'}$${parseFloat(t.amount).toLocaleString()}
                        </p>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="glass-card text-center text-slate-400 py-10"><p>Nėra transakcijų</p></div>';
        }
    } catch (err) {
        console.error('Audit error:', err);
        $('audit-list').innerHTML = '<p class="text-center text-red-400">Klaida įkeliant duomenis</p>';
    }
}

// ==============================================
// SHIFT MANAGEMENT
// ==============================================

async function checkActiveShift() {
    try {
        const { data } = await db
            .from('finance_active_shift_view')
            .select('*')
            .maybeSingle();
        
        const btn = $('shift-btn');
        
        if (data) {
            state.activeShiftId = data.id;
            state.shiftStartTime = new Date(data.start_time);
            
            btn.innerText = "Baigti pamainą";
            btn.style.background = "#ef4444";
            btn.style.color = "white";
            
            startTimer();
        } else {
            state.activeShiftId = null;
            
            btn.innerText = "Pradėti pamainą";
            btn.style.background = "white";
            btn.style.color = "#0d9488";
            
            if (state.timerInterval) clearInterval(state.timerInterval);
            $('shift-timer').innerText = "00:00:00";
        }
    } catch (err) {
        console.error('Check shift error:', err);
    }
}

function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    
    state.timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - state.shiftStartTime) / 1000);
        
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        
        $('shift-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function openOdoModal() {
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
    $('odo-modal').classList.remove('hidden');
}

async function confirmShiftAction() {
    try {
        const odoValue = $('odo-input').value;
        const odo = parseInt(odoValue);
        
        if (!odoValue || isNaN(odo) || odo < 0) {
            return alert("Įveskite tinkamą odometro rodmenį");
        }
        
        if (!state.activeShiftId) {
            // Start new shift
            const { error } = await db.from('finance_shifts').insert({
                user_id: state.user.id,
                start_odometer: odo,
                status: 'active'
            });
            
            if (error) throw error;
        } else {
            // End shift
            const { error } = await db
                .from('finance_shifts')
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
        await refreshCockpit();
    } catch (err) {
        console.error('Shift action error:', err);
        alert('Klaida: ' + err.message);
    }
}

// ==============================================
// TRANSACTIONS
// ==============================================

function openTx(mode) {
    state.txMode = mode;
    $('tx-amount').value = '';
    $('tx-modal').classList.remove('hidden');
}

async function saveTx() {
    try {
        const amountValue = $('tx-amount').value;
        const amount = parseFloat(amountValue);
        
        if (!amountValue || isNaN(amount) || amount <= 0) {
            return alert("Įveskite tinkamą sumą");
        }
        
        // Get default liquid asset
        const { data: asset } = await db
            .from('finance_assets')
            .select('id')
            .eq('user_id', state.user.id)
            .eq('is_liquid', true)
            .limit(1)
            .maybeSingle();
        
        if (!asset) {
            // Create default asset if none exists
            const { data: newAsset } = await db
                .from('finance_assets')
                .insert({
                    user_id: state.user.id,
                    name: 'Main Cash',
                    asset_type: 'cash',
                    cached_balance: 0,
                    is_liquid: true
                })
                .select()
                .single();
            
            asset = newAsset;
        }
        
        const { error } = await db.from('finance_transactions').insert({
            user_id: state.user.id,
            shift_id: state.activeShiftId,
            asset_id: asset.id,
            amount: amount,
            direction: state.txMode,
            source: 'shift'
        });
        
        if (error) throw error;
        
        // Update asset balance
        const change = state.txMode === 'in' ? amount : -amount;
        await db.rpc('increment_asset_balance', {
            asset_uuid: asset.id,
            delta: change
        });
        
        closeModals();
        await refreshCockpit();
        await refreshRunway();
        await refreshAudit();
    } catch (err) {
        console.error('Save tx error:', err);
        alert('Klaida išsaugant: ' + err.message);
    }
}

// ==============================================
// MODALS
// ==============================================

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

// ==============================================
// EVENT LISTENERS
// ==============================================

document.addEventListener('DOMContentLoaded', init);

// ESC key closes modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
});

// Enter key on login
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !$('auth-screen').classList.contains('hidden')) {
        login();
    }
});

// System theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'system') {
        applyTheme('system');
    }
});
