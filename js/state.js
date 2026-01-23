// --- STATE.JS (BE CIKLŲ) ---

export const state = new Proxy({
    user: null,
    fleet: [],
    activeShift: null,
    dailyCost: 0,
    shiftEarnings: 0,
    txDirection: 'in',
    loading: false
}, {
    set(target, key, value) {
        target[key] = value;
        
        // Vietoj tiesioginio kvietimo, siunčiame signalą į eterį
        window.dispatchEvent(new CustomEvent('state-updated', { detail: key }));
        
        return true;
    }
});
