// ════════════════════════════════════════════════════════════════
// ROBERT OS - AUTH.JS v1.7.5 (SECURITY LAYER)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { showToast } from '../utils.js';

export const actions = {
    'login': async () => {
        const email = document.getElementById('auth-email')?.value;
        const password = document.getElementById('auth-password')?.value;
        
        if (!email || !password) {
            showToast('Užpildykite visus laukus', 'warning');
            return;
        }

        try {
            console.log('🔐 Bandome prisijungti...');
            const { error } = await db.auth.signInWithPassword({ email, password });
            if (error) throw error;
            location.reload();
        } catch (err) {
            showToast('Klaida: ' + err.message, 'error');
        }
    },
    'logout': async () => {
        if (db) {
            await db.auth.signOut();
            location.reload();
        }
    }
};

export async function checkSession() {
    if (!db) return null;
    const { data: { session }, error } = await db.auth.getSession();
    if (error) return null;
    return session;
}
