// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v1.7.5 (ORCHESTRATOR)
// System Boot, Module Coordination & Event Mapping
// ════════════════════════════════════════════════════════════════

import { db, initSupabase } from './db.js';
import { state } from './state.js';
import { EventBinder } from './core/EventBinder.js';
import { 
    initGlobalErrorHandlers, 
    showToast 
} from './utils.js';

// --- FEATURE MODULES ---
import * as auth from './modules/auth.js';
import * as ui from './modules/ui.js';
import * as garage from './modules/garage.js';
import * as finance from './modules/finance.js';
import * as shifts from './modules/shifts.js';

// Sukuriame centrinį įvykių maršrutizatorių
const binder = new EventBinder();

// ────────────────────────────────────────────────────────────────
// 1. SYSTEM HYDRATION (Templates to DOM)
// ────────────────────────────────────────────────────────────────

function hydrateSystemUI() {
    const container = document.getElementById('modals-container');
    if (!container) return;

    // Saugiai klonuojame šablonus iš index.html
    const templates = ['tmpl-tx-modal', 'tmpl-delete-modal', 'tmpl-start-modal'];
    
    templates.forEach(id => {
        const tmpl = document.getElementById(id);
        if (tmpl) {
            container.appendChild(tmpl.content.cloneNode(true));
        } else {
            console.warn(`[Boot] Šablonas #${id} nerastas.`);
        }
    });

    console.log('💎 UI Hydration: Šablonai paruošti.');
}

// ────────────────────────────────────────────────────────────────
// 2. BOOT SEQUENCE
// ────────────────────────────────────────────────────────────────

async function bootSystem() {
    console.log('🚀 Robert OS v1.7.5: Booting...');

    // A. Saugumo sargyba ir DB jungtis
    initGlobalErrorHandlers();
    initSupabase(); // ✅ KOREKCIJA: Pašalintas 'await' (funkcija sinchroninė)

    // B. UI paruošimas
    hydrateSystemUI();

    // C. MODULIŲ REGISTRACIJA (Action Mapper)
    // Sujungiame HTML data-action su JS funkcijomis
    binder.registerModule('auth', auth.actions);
    binder.registerModule('ui', ui.actions);
    binder.registerModule('garage', garage.actions);
    binder.registerModule('finance', finance.actions);
    binder.registerModule('shifts', shifts.actions);

    // D. AUTH PATIKRA
    try {
        const session = await auth.checkSession();
        if (session) {
            await onUserAuthenticated();
        } else {
            ui.showAuthScreen();
        }
    } catch (err) {
        showToast('Kritinė krovimosi klaida', 'error');
    }
}

// ────────────────────────────────────────────────────────────────
// 3. POST-AUTH INITIALIZATION
// ────────────────────────────────────────────────────────────────

async function onUserAuthenticated() {
    state.loading = true;
    ui.showAppContent();

    // Lygiagretus duomenų užkrovimas (Performance Boost)
    await Promise.all([
        garage.loadFleet(),
        shifts.loadActive(),
        finance.loadSettings()
    ]);

    // Galutinis UI atnaujinimas
    ui.applyTheme();
    ui.refreshDashboard();
    
    state.loading = false;
    showToast('Sistema paruošta', 'success');
}

// Paleidžiame sistemą
document.addEventListener('DOMContentLoaded', bootSystem);

// Globalios nuorodos debugginimui (tik localhost)
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.ROBERT_OS = { state, binder, db };
}
