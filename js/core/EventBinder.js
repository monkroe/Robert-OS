// ════════════════════════════════════════════════════════════════
// ROBERT OS - EVENTBINDER.JS v1.2.0 (STABLE ROUTER)
// ════════════════════════════════════════════════════════════════

import { showToast } from '../utils.js';

export class EventBinder {
    constructor() {
        this.modules = new Map();
        this.init();
    }

    // Registruojame modulį (pvz. 'auth', 'ui') ir jo veiksmų objektą
    registerModule(name, actions) {
        if (!actions) {
            console.warn(`[Binder] Modulis "${name}" bandomas registruoti be veiksmų.`);
            return;
        }
        this.modules.set(name, actions);
        console.log(`[Binder] Modulis "${name}" užregistruotas.`);
    }

    init() {
        // Naudojame Event Delegation ant body
        document.body.addEventListener('click', async (e) => {
            // Surandame artimiausią elementą su data-action (palaiko paspaudimus ant piktogramų)
            const target = e.target.closest('[data-action]');
            if (!target) return;

            e.preventDefault();
            const actionString = target.dataset.action; // Pvz: "auth:login"
            
            try {
                await this.handleAction(actionString, target);
            } catch (err) {
                console.error(`[Binder Error] ${actionString}:`, err);
                showToast('Veiksmas nepavyko. Tikrinkite ryšį.', 'error');
            }
        });
    }

    async handleAction(actionString, element) {
        const [moduleName, actionName] = actionString.split(':');

        if (!moduleName || !actionName) {
            throw new Error(`Neteisingas action formatas: ${actionString}`);
        }

        const moduleActions = this.modules.get(moduleName);
        if (!moduleActions) {
            throw new Error(`Modulis "${moduleName}" nerastas registre.`);
        }

        const actionFn = moduleActions[actionName];
        if (typeof actionFn !== 'function') {
            throw new Error(`Veiksmas "${actionName}" modulyje "${moduleName}" neegzistuoja.`);
        }

        // Vykdome veiksmą
        return await actionFn(element);
    }
}
