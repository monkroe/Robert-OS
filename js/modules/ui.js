import { state } from '../state.js';

// --- LAIKRODŽIAI (CST / LT) ---
export function initClocks() {
    const container = document.getElementById('top-bar-clocks');
    if (!container) return;

    // Išvalome seną turinį ir sukuriame laikrodžius
    container.innerHTML = `
        <div class="flex gap-4 text-xs font-mono text-gray-400">
            <div class="flex items-center gap-1">
                <span>🇺🇸 CST</span>
                <span id="clock-cst" class="text-white font-bold">--:--</span>
            </div>
            <div class="flex items-center gap-1">
                <span class="text-zinc-600">|</span>
                <span>🇱🇹 LT</span>
                <span id="clock-lt" class="text-teal-500 font-bold">--:--</span>
            </div>
        </div>
    `;

    const updateTime = () => {
        const now = new Date();
        
        // CST (Chicago)
        const cstTime = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).format(now);

        // LT (Vilnius)
        const ltTime = new Intl.DateTimeFormat('lt-LT', {
            timeZone: 'Europe/Vilnius',
            hour: '2-digit', minute: '2-digit'
        }).format(now);

        document.getElementById('clock-cst').textContent = cstTime;
        document.getElementById('clock-lt').textContent = ltTime;
    };

    updateTime();
    setInterval(updateTime, 1000);
}

// --- PAGRINDINIS UI ATNAUJINIMAS ---
export function updateUI(type) {
    if (type === 'stats' || type === 'all') updateStats();
    if (type === 'activeShift' || type === 'all') updateActiveShiftUI();
}

function updateStats() {
    // 1. Sutvarkytas PROGRESS BAR (tas, kur rodė $83)
    // Dabar jis rodys Dienos Tikslą (jei nustatytas) arba nieko
    
    const goalEl = document.getElementById('daily-goal-bar');
    const todayEarned = state.stats?.today || 0;
    
    // Paimame tikslą iš aktyvios pamainos arba nustatymų (jei ateityje bus)
    const dailyTarget = state.activeShift?.target_money || 0;

    let html = '';
    
    if (dailyTarget > 0) {
        // Jei yra tikslas - rodome progresą
        const percent = Math.min((todayEarned / dailyTarget) * 100, 100);
        html = `
            <div class="flex justify-between text-xs mb-1 px-1">
                <span class="text-gray-500 font-bold">TIKSLAS: $${dailyTarget}</span>
                <span class="text-${percent >= 100 ? 'teal' : 'gray'}-400 font-mono">$${todayEarned.toFixed(0)} (${percent.toFixed(0)}%)</span>
            </div>
            <div class="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div class="h-full bg-teal-500 transition-all duration-1000" style="width: ${percent}%"></div>
            </div>
        `;
    } else {
        // Jei tikslo nėra - rodome tiesiog švarią, ramią informaciją arba slepiame
        // Čia nebededame to juodo baro su $83
        html = `
             <div class="flex justify-between text-xs px-1 opacity-50">
                <span>Šiandien uždirbta</span>
                <span class="font-mono">$${todayEarned.toFixed(2)}</span>
            </div>
        `;
    }

    if(goalEl) goalEl.innerHTML = html;

    // Atnaujiname pagrindinį skaitliuką
    const mainAmount = document.getElementById('main-amount');
    if(mainAmount) mainAmount.textContent = `$${todayEarned.toFixed(2)}`;
}

function updateActiveShiftUI() {
    const btn = document.getElementById('shift-btn');
    const timer = document.getElementById('shift-timer');
    const status = document.getElementById('shift-status');
    const liveStats = document.getElementById('live-shift-stats');
    
    if (state.activeShift) {
        // Vyksta pamaina
        const isPaused = state.activeShift.status === 'paused';
        
        btn.innerHTML = isPaused ? 
            '<span class="text-xl">▶️</span> <span class="text-sm">TĘSTI</span>' : 
            '<span class="text-xl">⏸️</span> <span class="text-sm">PAUZĖ</span>';
        
        btn.onclick = () => window.handlePause(); // Globali funkcija iš shifts.js
        btn.className = "flex-1 py-4 bg-zinc-800 rounded-xl font-bold text-white border border-zinc-700 active:scale-95 transition flex flex-col items-center justify-center gap-1";

        status.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="relative flex h-3 w-3">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-green-400'} opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-3 w-3 ${isPaused ? 'bg-yellow-500' : 'bg-green-500'}"></span>
                </span>
                <span class="uppercase tracking-widest text-xs font-bold ${isPaused ? 'text-yellow-500' : 'text-green-500'}">
                    ${isPaused ? 'SUSTABDYTA' : 'PAMAINOJE'}
                </span>
            </div>
        `;

        // Atnaujiname LIVE statistiką (jei suvesta pajamų)
        if(liveStats) {
            liveStats.innerHTML = `
                <div class="grid grid-cols-2 gap-4 mt-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
                    <div>
                        <p class="text-[10px] text-gray-500 uppercase">Uždirbta (Live)</p>
                        <p class="text-lg font-mono text-green-400">$${state.activeShift.gross_earnings || 0}</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-gray-500 uppercase">Tikslas (Val)</p>
                        <p class="text-lg font-mono text-blue-400" id="target-time-display">--:--</p>
                    </div>
                </div>
            `;
        }

    } else {
        // Nėra pamainos
        btn.innerHTML = '<span class="text-xl">🚀</span> <span class="text-sm">START SHIFT</span>';
        btn.className = "flex-1 py-4 bg-teal-500 text-black rounded-xl font-bold shadow-[0_0_20px_rgba(20,184,166,0.3)] active:scale-95 transition flex flex-col items-center justify-center gap-1";
        btn.onclick = () => window.openStartModal(); // Globali funkcija

        timer.textContent = "00:00:00";
        status.innerHTML = '<span class="text-gray-500 text-xs font-bold uppercase tracking-widest">POILSIS</span>';
        if(liveStats) liveStats.innerHTML = '';
    }
}

export function closeModals() {
    document.querySelectorAll('.fixed').forEach(m => m.classList.add('hidden'));
}
