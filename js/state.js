// --- STATE.JS (v1.1.1 - FULL UPDATE) ---

export const state = new Proxy({
    // Esami kintamieji
    user: null,
    fleet: [],
    activeShift: null,
    dailyCost: 0,
    shiftEarnings: 0,
    txDirection: 'in',
    loading: false,

    // Nauji kintamieji išmaniam laikmačiui ir tikslams
    pausedAtTime: null,    // Saugosime laiką tekstiniu formatu (pvz., "14:20"), kada paspausta pauzė
    lastDrivingMs: 0,      // Sukauptas gryno vairavimo laikas milisekundėmis iki pauzės
    
    targetMoney: 0,        // Piniginis tikslas pamainai
    targetTime: 12,        // Laiko tikslas valandomis (default 12 val.)
    
    currentWeather: 'sunny' // Numatytosios vairavimo sąlygos
}, {
    set(target, key, value) {
        target[key] = value;
        
        // Siunčiame signalą, kad būsena pasikeitė
        window.dispatchEvent(new CustomEvent('state-updated', { detail: key }));
        
        return true;
    }
});
