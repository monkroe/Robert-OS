// ════════════════════════════════════════════════════════════════
// ROBERT OS - AUTH.JS v1.4.0 (STABLE)
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { showToast } from '../utils.js';

// 1. ACTION MAPPER (Būtinas EventBinderiui)
export const actions = {
    'login': async () => {
        console.log('🔐 Bandoma prisijungti...');
        try {
            await login();
        } catch (err) {
            console.error('Login Action Error:', err);
            showToast('Prisijungimas nepavyko: ' + err.message, 'error');
        }
    }
};

// 2. PAGRINDINĖ LOGIN LOGIKA
export async function login() {
    // Patikriname, ar DB klientas paruoštas
    if (!db) {
        throw new Error("Duomenų bazės ryšys nėra sukonfigūruotas.");
    }

    // Robert OS naudoja standartinį Supabase Auth (pvz., Google OAuth)
    // Jei naudoji el. paštą/slaptažodį, čia turėtų būti db.auth.signInWithPassword()
    const { data, error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });

    if (error) throw error;
    return data;
}

// 3. SESIJOS PATIKRA (Kviečiama iš app.js boot metu)
export async function checkSession() {
    if (!db) return null;
    
    try {
        const { data: { session }, error } = await db.auth.getSession();
        if (error) throw error;
        return session;
    } catch (err) {
        console.error("Session Check Error:", err);
        return null;
    }
}

// 4. ATSIJUNGIMAS
export async function logout() {
    if (!db) return;
    await db.auth.signOut();
    location.reload();
}
