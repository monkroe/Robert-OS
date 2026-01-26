// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI.JS v1.7.5 (INTERFACE ENGINE)
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';

export const actions = {
    'logout': () => {
        console.log('🔄 Atsijungiame...');
        location.reload(); 
    }
};

export function showAuthScreen() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div class="flex items-center justify-center min-h-[80vh] animate-slideUp">
            <div class="bento-card p-10 w-full max-w-md bg-[#111] border border-white/5 shadow-2xl">
                <div class="text-center mb-8">
                    <h1 class="text-4xl font-black tracking-tighter text-teal-500 italic">ROBERT OS</h1>
                    <p class="text-white/40 text-[10px] uppercase tracking-widest mt-2 font-bold italic">v1.7.5 Security</p>
                </div>
                
                <div class="space-y-4">
                    <input type="email" id="auth-email" class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-sm focus:border-teal-500 outline-none transition-all" placeholder="El. paštas">
                    <input type="password" id="auth-password" class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-sm focus:border-teal-500 outline-none transition-all" placeholder="Slaptažodis">
                    <button data-action="auth:login" class="w-full bg-white text-black hover:bg-teal-500 hover:text-white py-4 rounded-2xl font-black transition-all active:scale-95">PRISIJUNGTI</button>
                </div>
                
                <p class="mt-8 text-[10px] text-white/20 font-mono italic text-center">Release Guardian 2026</p>
            </div>
        </div>
    `;
}

export function showAppContent() {
    const app = document.getElementById('app');
    if (!app) return;
    app.className = "min-h-screen p-4 md:p-8 max-w-5xl mx-auto block";
    app.innerHTML = `
        <div class="animate-slideUp space-y-8 w-full">
            <header class="flex justify-between items-center pb-6 border-b border-white/5">
                <div>
                    <h2 class="text-teal-500 font-black text-xl tracking-tighter italic">ROBERT OS v1.7.5</h2>
                    <p class="text-white/30 text-[10px] uppercase tracking-widest font-bold">Dashboard Active</p>
                </div>
                <button data-action="auth:logout" class="p-3 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 transition-all">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"></path></svg>
                </button>
            </header>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div id="fleet-widget" class="bento-card p-8 min-h-[200px] border border-white/5"></div>
                <div id="finance-widget" class="bento-card p-8 min-h-[200px] border border-white/5"></div>
                <div id="shifts-widget" class="bento-card p-8 min-h-[200px] border border-white/5"></div>
            </div>
        </div>
    `;
}

export function applyTheme() {
    document.documentElement.classList.add('dark');
}

export function refreshDashboard() {
    console.log('🔄 UI v1.7.5: Dashboard refreshed');
}
