// ════════════════════════════════════════════════════════════════
// ROBERT OS - EVENTBINDER.JS v1.7.5 (CORE)
// Centralizuota įvykių delegavimo ir maršrutizavimo sistema
// ════════════════════════════════════════════════════════════════

export class EventBinder {
    constructor() {
        this.modules = new Map(); // Registruotų modulių saugykla
        this.isBusy = false;      // Sistemos užimtumo saugiklis
        this.init();
    }

    /**
     * Užregistruoja modulį ir jo veiksmus orkestratoriuje
     * @param {string} namespace - Modulio vardas (pvz., 'garage')
     * @param {Object} actions - Veiksmų objektas { metodoVardas: funkcija }
     */
    registerModule(namespace, actions) {
        this.modules.set(namespace, actions);
        console.log(`[EventBinder] Modulis '${namespace}' sėkmingai užregistruotas.`);
    }

    init() {
        // Naudojame Event Delegation – vienas klausytojas visai sistemai
        document.body.addEventListener('click', async (e) => {
            // Ieškome artimiausio elemento su data-action atributu
            const actionElement = e.target.closest('[data-action]');
            if (!actionElement) return;

            // Sustabdome numatytąją elgseną (pvz., formos siuntimą)
            e.preventDefault();

            const actionRaw = actionElement.dataset.action; // Pvz: "garage:open"
            const [namespace, method] = actionRaw.split(':');
            
            // 1. SAUGUMAS: Ar sistema neužimta kita operacija?
            if (this.isBusy) {
                console.warn('[EventBinder] Sistema užimta, veiksmas ignoruojamas:', actionRaw);
                // Čia galima pridėti utils.vibrate([10, 50]) kaip feedback'ą
                return;
            }

            // 2. PAIEŠKA: Ar toks modulis ir metodas egzistuoja?
            const moduleActions = this.modules.get(namespace);
            if (!moduleActions || typeof moduleActions[method] !== 'function') {
                console.error(`[EventBinder] Klaida: Veiksmas '${actionRaw}' nerastas.`);
                return;
            }

            // 3. PAYLOAD: Duomenų parsinimas iš HTML
            let payload = actionElement.dataset.payload;
            try {
                // Bandome konvertuoti JSON, jei nepavyksta – paliekame stringą
                payload = JSON.parse(payload);
            } catch (err) {
                // Tęsiame su originaliu stringu
            }

            // 4. VYKDYMAS: Su klaidų kontrole ir UI blokavimu
            try {
                this.isBusy = true;
                // Vizualinis indikatorius (naudojamas style.css)
                document.body.classList.add('system-busy'); 
                
                // Vykdome komandą (laukiam, kol baigsis DB užklausa)
                await moduleActions[method](payload, actionElement);
                
            } catch (error) {
                console.error(`[EventBinder] Kritinė klaida vykdant '${actionRaw}':`, error);
                // Čia kviečiame showToast iš utils.js
                if (window.showToast) {
                    window.showToast('Veiksmas nepavyko. Tikrinkite ryšį.', 'error');
                }
            } finally {
                this.isBusy = false;
                document.body.classList.remove('system-busy');
            }
        });
    }
}
