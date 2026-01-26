// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI.JS v1.1.2 (PRODUCTION STABLE)
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';

// 1. ACTION MAPPER (Būtinas EventBinder.js)
// Šie raktai turi sutapti su HTML esančiais data-action="ui:pavadinimas"
export const actions = {
    'logout': () => {
        console.log('Sistemos atsijungimas...');
        location.reload(); 
    },
    'toggle-theme': () => {
        document.documentElement.classList.toggle('dark');
        console.log('Tema pakeista');
    }
};

// 2. AUTH SCREEN RENDERER
export function showAuthScreen() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div class="flex items-center justify-center min-h-[80vh] animate-slideUp">
            <div class="bento-card p-10 w-full max-w-md text-center border-teal-500/20 shadow-2xl bg-[#111]">
                <div class="mb-6">
                    <h1 class="text-4xl font-black tracking-tighter text-teal-500 italic">ROBERT OS</h1>
                    <div class="h-1 w-12 bg-teal-500 mx-auto mt-2 rounded-full"></div>
                </div>
                
                <p class="text-white/40 text-xs mb-8 uppercase tracking-[0.3em] font-bold">Security Layer v1.7</p>
                
                <button data-action="auth:login" 
                        class="w-full bg-white text-black hover:bg-teal-500 hover:text-white py-4 rounded-full font-black transition-all transform active:scale-95 shadow-lg shadow-white/5">
                    PRISIJUNGTI PRIE SISTEMOS
                </button>
                
                <p class="mt-8 text-[10px] text-white/20 font-mono italic">Protected by Release Guardian 2026</p>
            </div>
        </div>
    `;
    console.log("🖥️ UI: Auth ekranas sugeneruotas.");
}

// 3. MAIN APP CONTENT RENDERER
export function showAppContent() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div class="animate-slideUp space-y-8 w-full">
            <header class="flex justify-between items-center pb-6 border-b border-white/5">
                <div>
                    <h2 class="text-teal-500 font-black text-xl tracking-tighter">ROBERT OS</h2>
                    <p class="text-white/30 text-[10px] uppercase tracking-widest">Dashboard Active</p>
                </div>
                <button data-action="ui:logout" class="p-2 hover:bg-red-500/10 rounded-full transition-colors">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="text-red-500"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"></path></svg>
                </button>
            </header>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div id="fleet-widget" class="bento-card p-8 min-h-[200px] flex flex-col justify-between border-teal-500/10 hover:border-teal-500/30 transition-colors">
                    <h3 class="text-white/40 text-xs font-bold uppercase tracking-widest">Garažas</h3>
                    <div class="animate-pulse flex space-x-2"><div class="h-2 w-2 bg-teal-500 rounded-full"></div><span class="text-sm">Kraunama...</span></div>
                </div>
                
                <div id="finance-widget" class="bento-card p-8 min-h-[200px] flex flex-col justify-between border-white/5 hover:border-white/10 transition-colors">
                    <h3 class="text-white/40 text-xs font-bold uppercase tracking-widest">Finansai</h3>
                    <div class="text-2xl font-black">€ --.--</div>
                </div>

                <div id="shifts-widget" class="bento-card p-8 min-h-[200px] flex flex-col justify-between border-white/5 bg-gradient-to-br from-transparent to-teal-500/5">
                    <h3 class="text-white/40 text-xs font-bold uppercase tracking-widest">Pamainos</h3>
                    <button data-action="shifts:start" class="bg-teal-500 text-black text-xs font-black py-2 rounded-full mt-4">PRADĖTI</button>
                </div>
            </div>
        </div>
    `;
    console.log("🖥️ UI: Pagrindinis turinis užkrautas.");
}

// 4. THEME & UTILS
export function applyTheme() {
    document.documentElement.classList.add('dark');
    console.log('🎨 UI: Tema pritaikyta.');
}

export function refreshDashboard() {
    console.log('🔄 UI: Dashboard atnaujintas.');
}
