// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/AUTH.JS v2.1.0
// Logic: Authentication & Session Management
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { showToast, vibrate } from '../utils.js';
import * as SessionSync from './session-sync.js';

export async function login() {
    vibrate([10]);
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    
    // Paprasta validacija
    if (!email || !password) {
        showToast('PLEASE ENTER CREDENTIALS', 'warning');
        return;
    }

    const { error } = await db.auth.signInWithPassword({ email, password });
    
    if (error) {
        console.error('Login Error:', error);
        showToast(error.message, 'error');
    } else {
        // Session Domain Multi-Door milestone (robert-os-hub docs/05-roadmap):
        // bootstrap the second, Benas-project client with the same
        // credentials while they're still in scope. Awaited so its own
        // session is persisted to localStorage BEFORE reload wipes this
        // function's memory -- a fire-and-forget call here could lose the
        // race against reload and silently never bootstrap. A failure here
        // must not block the primary login; bootstrapWithCredentials()
        // already swallows its own errors.
        await SessionSync.bootstrapWithCredentials(email, password);
        // Perkrovimas būtinas norint iš naujo inicijuoti visus modulius švariai
        location.reload();
    }
}

export async function logout() {
    vibrate([10]);
    // Išsaugome temą, kad vartotojas neliktų "aklas" po atsijungimo
    const savedTheme = localStorage.getItem('theme');
    
    await db.auth.signOut();
    // Mirrors the primary signOut -- otherwise the Benas refresh token stays
    // valid server-side after localStorage.clear() below wipes its local
    // copy. Wrapped so a failure here can never block the primary logout,
    // which must always succeed.
    try {
        await SessionSync.unsubscribe();
        await SessionSync.benasDb.auth.signOut();
    } catch (err) {
        console.warn('⚠️ session-sync: Benas signOut failed:', err);
    }
    localStorage.clear();
    
    if (savedTheme) localStorage.setItem('theme', savedTheme);
    location.reload();
}
