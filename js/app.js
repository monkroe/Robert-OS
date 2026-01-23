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
    UI.updateDualClocks(); // Iškart parodome laiką v1.1.1
    
    // Atnaujiname pasaulio laikrodžius kas minutę
    setInterval(() => UI.updateDualClocks(), 60000);
    
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
    
    // --- KLAUSYTOJAI ---
    
    window.addEventListener('refresh-data', () => {
        refreshAll();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'auto') UI.applyTheme();
    });

    // Pagauname UI pranešimą apie pamainos būseną
    window.addEventListener('shiftStateChanged', (e) => {
        if (e.detail) {
            Shifts.startTimer();
        } else {
            Shifts.stopTimer();
        }
    });
}

// --- PAGRINDINĖ FUNKCIJA (KOMANDAVIMO CENTRAS) ---
export async function refreshAll() {
    const { data: shift } = await db.from('finance_shifts')
        .select('*')
        .eq('status', 'active')
        .eq('user_id', state.user.id)
        .maybeSingle();
    
    state.activeShift = shift; 

    // Jei turime aktyvią pamainą, atnaujiname tikslus State'e
    if (shift) {
        state.targetMoney = shift.target_money || 0;
        state.targetTime = shift.target_time || 12;
    }

    UI.updateUI('activeShift');
    UI.updateGrindBar();
    Finance.refreshAudit();
}

function setupRealtime() {
    db.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAll()).subscribe();
}

// --- EXPOSE TO WINDOW ---
window.login = Auth.login;
window.logout = Auth.logout;
window.register = Auth.register;

window.openGarage = Garage.openGarage;
window.saveVehicle = Garage.saveVehicle;
window.deleteVehicle = Garage.deleteVehicle;
window.setVehType = Garage.setVehType;
window.toggleTestMode = Garage.toggleTestMode;

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
