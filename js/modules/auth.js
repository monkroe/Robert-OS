// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/AUTH.JS v2.1.0
// Logic: Authentication & Session Management
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { showToast, vibrate } from '../utils.js';

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
        // Perkrovimas būtinas norint iš naujo inicijuoti visus modulius švariai
        location.reload();
    }
}

export async function logout() {
    vibrate([10]);
    // Išsaugome temą, kad vartotojas neliktų "aklas" po atsijungimo
    const savedTheme = localStorage.getItem('theme');
    
    await db.auth.signOut();
    localStorage.clear();
    
    if (savedTheme) localStorage.setItem('theme', savedTheme);
    location.reload();
}
