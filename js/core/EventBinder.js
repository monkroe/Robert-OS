// ════════════════════════════════════════════════════════════════
// ROBERT OS - EVENTBINDER.JS v1.7.5 (ACTION ROUTER)
// ════════════════════════════════════════════════════════════════

import { showToast } from '../utils.js';

export class EventBinder {
    constructor() {
        this.modules = new Map();
        this.init();
    }

    registerModule(name, actions) {
        if (actions) {
            this.modules.set(name, actions);
            console.log(`📦 Binder: Modulis [${name}] užregistruotas`);
        }
    }

    init() {
        document.body.addEventListener('click', async (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            e.preventDefault();
            const actionString = target.dataset.action;
            const [mod, act] = actionString.split(':');
            const moduleActions = this.modules.get(mod);

            try {
                if (!moduleActions || !moduleActions[act]) {
                    throw new Error(`Veiksmas ${mod}:${act} nerastas registre`);
                }
                await moduleActions[act](target);
            } catch (err) {
                console.error('⚠️ Action Fail:', err);
                showToast('Veiksmas nepavyko: ' + err.message, 'error');
            }
        });
    }
}
