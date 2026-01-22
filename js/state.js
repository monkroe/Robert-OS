import { updateUI } from './modules/ui.js';

// Būsena (State) su automatiniu UI atnaujinimu
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
        updateUI(key); // Kai pasikeičia duomenys, atnaujinam ekraną
        return true;
    }
});

