// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI.JS v1.1.0
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';

// 1. ACTION MAPPER (Reikalingas EventBinderiui)
export const actions = {
    'logout': () => {
        console.log('Logging out...');
        // auth.logout() ir t.t.
    },
    'toggle-menu': () => {
        console.log('Toggle menu');
    }
};

// 2. PAGRINDINĖS FUNKCIJOS
export function showAuthScreen() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="animate-slideUp bento-card p-8 max-w-sm mx-auto mt-20 text-center">
            <h1 class="text-2xl font-black text-teal-500 mb-4">ROBERT OS</h1>
            <p class="text-white/60 mb-6">Prašome prisijungti prie sistemos</p>
            <button data-action="auth:login" class="bg-teal-500 text-black px-6 py-3 rounded-full font-bold hover:bg-teal-400 transition-all">
                Prisijungti
            </button>
        </div>
    `;
}

export function showAppContent() {
    const app = document.getElementById('app');
    // Pašaliname krovimosi indikatorių ir įkeliame pagrindinį layoutą
    app.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full animate-slideUp">
            <div id="fleet-widget" class="bento-card p-6 h-64 flex items-center justify-center border-teal-500/20">
                <span class="text-white/20">Kraunamas automobilių parkas...</span>
            </div>
            <div id="finance-widget" class="bento-card p-6 h-64 flex items-center justify-center border-teal-500/20">
                <span class="text-white/20">Kraunami finansai...</span>
            </div>
        </div>
    `;
}

export function applyTheme() {
    console.log('🎨 Theme applied');
    document.documentElement.classList.add('dark');
}

export function refreshDashboard() {
    console.log('🔄 Dashboard refreshed');
    // Čia vyks duomenų atvaizdavimas iš state
}

// Pagalbinė funkcija pranešimams (iš utils.js dažniausiai)
export function updateLoadingState(isLoading) {
    state.loading = isLoading;
    // UI indikacija...
}
