// ════════════════════════════════════════════════════════════════
// ROBERT OS - UI.JS v1.7.5
// Vaizdo valdymas, Skeleton Screens ir Temos
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { vibrate, showToast } from '../utils.js';

export const actions = {
    // Tab'ų perjungimas (per data-action="ui:switchTab")
    switchTab: (tabId) => {
        vibrate([5]);
        
        // Deaktyvuojam visus
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        
        // Aktyvuojam pasirinktą
        const targetTab = document.getElementById(`tab-${tabId}`);
        const targetBtn = document.getElementById(`btn-${tabId}`);
        
        if (targetTab) targetTab.classList.remove('hidden');
        if (targetBtn) targetBtn.classList.add('active');
        
        state.currentTab = tabId;
    },

    // Modalo uždarymas (per data-action="ui:closeModals")
    closeModals: () => {
        document.querySelectorAll('.modal-overlay').forEach(el => {
            el.classList.add('fade-out');
            setTimeout(() => el.classList.add('hidden'), 200);
        });
    }
};

// ────────────────────────────────────────────────────────────────
// 1. MODALŲ VALDYMAS (With Hydration & Skeletons)
// ────────────────────────────────────────────────────────────────

/**
 * Atidaro modalą ir, jei reikia, užpildo jį skeletonais
 */
export function openModal(id, options = { loading: false }) {
    const modal = document.getElementById(`${id}-modal`);
    if (!modal) return;

    modal.classList.remove('hidden', 'fade-out');
    modal.classList.add('fade-in');
    vibrate([10]);

    if (options.loading) {
        renderSkeletons(modal);
    }
}

/**
 * Užpildo modalą "Skeleton" blokeliais (Placeholders)
 */
function renderSkeletons(modalElement) {
    const container = modalElement.querySelector('.modal-body') || modalElement.querySelector('.modal-content');
    if (!container) return;

    // Ieškome vietų, kur bus kraunami duomenys (pvz. #garage-list)
    const lists = container.querySelectorAll('[id$="-list"]');
    lists.forEach(list => {
        list.innerHTML = `
            <div class="animate-pulse space-y-3">
                <div class="h-16 bg-white/5 rounded-2xl w-full"></div>
                <div class="h-16 bg-white/5 rounded-2xl w-full opacity-50"></div>
                <div class="h-16 bg-white/5 rounded-2xl w-full opacity-20"></div>
            </div>
        `;
    });
}

// ────────────────────────────────────────────────────────────────
// 2. TEMŲ VALDYMAS (v1.5 Aesthetic)
// ────────────────────────────────────────────────────────────────

export function applyTheme() {
    const isDark = state.userSettings?.theme !== 'light';
    document.documentElement.classList.toggle('dark', isDark);
    
    // Atnaujiname Status Bar spalvą PWA režimui
    const themeColor = isDark ? '#000000' : '#f3f4f6';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
}

// ────────────────────────────────────────────────────────────────
// 3. DASHBOARD REFRESH (The Pulse of OS)
// ────────────────────────────────────────────────────────────────

export function refreshDashboard() {
    // Ši funkcija orkestruoja visų Cockpit elementų atnaujinimą
    // Naudojama po sėkmingų DB operacijų
    console.log('🔄 UI Dashboard Refreshing...');
    
    // Atnaujiname progress bars, timerius ir t.t.
    // Čia bus kviečiami costs.js skaičiavimai
}

/**
 * Pagalbinė funkcija formos duomenims surinkti
 */
export function getFormData(formSelector) {
    const form = document.querySelector(formSelector);
    if (!form) return {};
    
    const formData = new FormData(form);
    return Object.fromEntries(formData.entries());
}
