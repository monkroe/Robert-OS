// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v1.7.6 (STABILIZED)
// ════════════════════════════════════════════════════════════════

import { db, initSupabase } from './db.js';
import { state } from './state.js';
import { EventBinder } from './core/EventBinder.js';
import { initGlobalErrorHandlers, showToast } from './utils.js';

import * as auth from './modules/auth.js';
import * as ui from './modules/ui.js';
import * as garage from './modules/garage.js';
import * as finance from './modules/finance.js';
import * as shifts from './modules/shifts.js';

const binder = new EventBinder();

// 1. HYDRATION Taisymas: Naudojame tai, kas yra index.html
function hydrateSystemUI() {
    const container = document.getElementById('modals-container');
    if (!container) return;

    // Kadangi index.html turi tik bendrą 'modal-template', 
    // specifinius šablonus turi generuoti patys moduliai arba jie turi būti index.html.
    // Kol kas užtikriname, kad bent pagrindinis konteineris veikia.
    console.log('💎 UI Hydration: Sluoksniai paruošti.');
}

// 2. BOOT SEQUENCE (Iškviečiama tiesiogiai)
export async function bootSystem() {
    if (state.booted) return; // Apsauga nuo dvigubo paleidimo
    
    console.log('🚀 Robert OS v1.7.6: Booting...');

    try {
        // A. Saugumas
        initGlobalErrorHandlers();
        
        // Patikra, ar Supabase SDK pasiekiamas (iš index.html)
        if (!window.supabaseClient) {
            throw new Error("Supabase SDK nerastas. Patikrinkite tinklo ryšį.");
        }

        initSupabase(); 

        // B. UI
        hydrateSystemUI();

        // C. Moduliai
        binder.registerModule('auth', auth.actions);
        binder.registerModule('ui', ui.actions);
        binder.registerModule('garage', garage.actions);
        binder.registerModule('finance', finance.actions);
        binder.registerModule('shifts', shifts.actions);

        // D. Auth
        const session = await auth.checkSession();
        if (session) {
            await onUserAuthenticated();
        } else {
            ui.showAuthScreen();
        }

        state.booted = true;
    } catch (err) {
        console.error('❌ BOOT CRITICAL ERROR:', err);
        showToast(err.message, 'error');
    }
}

async function onUserAuthenticated() {
    state.loading = true;
    ui.showAppContent();

    try {
        // Naudojame Promise.allSettled, kad viena klaida nesustabdytų visos sistemos
        const results = await Promise.allSettled([
            garage.loadFleet(),
            shifts.loadActive(),
            finance.loadSettings()
        ]);

        // Loguojame klaidas, jei jų buvo
        results.forEach((res, i) => {
            if (res.status === 'rejected') console.error(`Module ${i} failed:`, res.reason);
        });

    } catch (err) {
        showToast('Duomenų sinchronizacijos klaida', 'warning');
    } finally {
        ui.applyTheme();
        ui.refreshDashboard();
        state.loading = false;
        showToast('Sistema paruošta', 'success');
    }
}

// 3. EXECUTION: Vietoj DOMContentLoaded, paleidžiame iškart, 
// nes app.js kraunamas tik tada, kai DOM jau paruoštas.
bootSystem();

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.ROBERT_OS = { state, binder, db, bootSystem };
}
