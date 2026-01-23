export const state = new Proxy({
    user: null,
    fleet: [],
    activeShift: null,
    dailyCost: 0,
    shiftEarnings: 0,
    txDirection: 'in',
    loading: false,
    pausedAtTime: null,
    lastDrivingMs: 0,
    targetMoney: 0,
    targetTime: 12,
    currentWeather: 'sunny' 
}, {
    set(target, key, value) {
        target[key] = value;
        window.dispatchEvent(new CustomEvent('state-updated', { detail: key }));
        return true;
    }
});
