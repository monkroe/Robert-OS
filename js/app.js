import { db } from './db.js';
import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as Garage from './modules/garage.js';
import * as Shifts from './modules/shifts.js';
import * as Finance from './modules/finance.js';
import * as UI from './modules/ui.js';

// --- INIT ---
async function init() {
    UI.applyTheme();
    
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        state.user = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        await Garage.fetchFleet(); 
        await refreshAll(); 
        setupRealtime();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'auto') UI.applyTheme();
    });
    
    window.addEventListener('shiftStateChanged', (e) => {
        if(e.detail) Shifts.startTimer(); else Shifts.stopTimer();
    });
}

// --- GLOBAL REFRESH ---
export async function refreshAll() {
    const { data: shift } = await db.from('finance_shifts').select('*').eq('status', 'active').maybeSingle();
    state.activeShift = shift;

    const monthlyFixed = 2500; 
    let vehicleCost = 0;
    if (shift) {
        const v = state.fleet.find(f => f.id === shift.vehicle_id);
        if (v) vehicleCost = v.operating_cost_weekly / 7;
    } else if (state.fleet.length > 0) {
        if (state.fleet[0].operating_cost_weekly) vehicleCost = state.fleet[0].operating_cost_weekly / 7;
    }

    state.dailyCost = (monthlyFixed / 30) + vehicleCost;
    state.shiftEarnings = shift?.gross_earnings || 0; 
    
    UI.updateGrindBar();
    Finance.refreshAudit();
}

function setupRealtime() {
    db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe();
}

// --- EXPOSE TO WINDOW (BŪTINA KAD VEIKTŲ MYGTUKAI) ---
window.login = Auth.login;
window.logout = Auth.logout;

// Garažas
window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
window.deleteVehicle = Garage.deleteVehicle; // <--- SVARBU: Čia "įjungiamas" trynimas
window.setVehType = Garage.setVehType;

// Kiti
window.openStartModal = Shifts.openStartModal;
window.confirmStart = Shifts.confirmStart;
window.openEndModal = Shifts.openEndModal;
window.confirmEnd = Shifts.confirmEnd;
window.togglePause = Shifts.togglePause;

window.openTxModal = Finance.openTxModal;
window.setExpType = Finance.setExpType;
window.confirmTx = Finance.confirmTx;
window.exportAI = Finance.exportAI;

window.cycleTheme = UI.cycleTheme;
window.closeModals = UI.closeModals;
window.switchTab = UI.switchTab;

document.addEventListener('DOMContentLoaded', init);
