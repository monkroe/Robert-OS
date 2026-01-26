// ════════════════════════════════════════════════════════════════
// ROBERT OS - APP.JS v1.7.5 (SYSTEM ORCHESTRATOR)
// ════════════════════════════════════════════════════════════════

import { db, initSupabase } from './db.js';
import { state } from './state.js';
import { EventBinder } from './core/EventBinder.js';
import { initGlobalErrorHandlers, showToast } from './utils.js';

import * as auth from './modules/auth.js';
import * as ui from './modules/ui.js';
import * as garage from './modules/garage.js';
import * as shifts from './modules/shifts.js';
import * as finance from './modules/finance.js';

const binder = new EventBinder();

async function bootSystem() {
    console.log('🚀 Robert OS v1.7.5: Paleidžiama...');
    try {
        initGlobalErrorHandlers();
        initSupabase();

        binder.registerModule('auth', auth.actions);
        binder.registerModule('ui', ui.actions);
        binder.registerModule('garage', garage.actions);
        binder.registerModule('shifts', shifts.actions);
        binder.registerModule('finance', finance.actions);

        const { data: { session } } = await db.auth.getSession();
        
        if (session) {
            await onUserAuthenticated();
        } else {
            ui.showAuthScreen();
        }
    } catch (err) {
        console.error('❌ Boot Error:', err);
        showToast('Sistemos klaida: ' + err.message, 'error');
    }
}

async function onUserAuthenticated() {
    state.loading = true;
    ui.showAppContent();
    ui.applyTheme();
    
    await Promise.allSettled([
        garage.loadFleet(),
        shifts.loadActive(),
        finance.loadSettings()
    ]);
    
    ui.refreshDashboard();
    state.loading = false;
    showToast('Sistema paruošta', 'success');
}

bootSystem();
