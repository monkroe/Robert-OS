// ════════════════════════════════════════════════════════════════
// ROBERT OS - AUTH MODULE v1.7.2
// Authentication with Memory Cleanup & Timer Management
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { state } from '../state.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────────────────────────

export async function login() {
    vibrate();
    
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value;
    
    if (!email || !password) {
        return showToast('Įvesk email ir slaptažodį', 'error');
    }
    
    state.loading = true;
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        
        if (error) throw error;
        
        state.user = data.user;
        showToast('Sveiki sugrįžę! 👋', 'success');
        
        // Trigger post-login flow in app.js
        window.dispatchEvent(new CustomEvent('user-logged-in'));
        
    } catch (error) {
        console.error('Login error:', error);
        showToast('Prisijungimo klaida. Bandykite dar kartą.', 'error');
    } finally {
        state.loading = false;
    }
}

// ────────────────────────────────────────────────────────────────
// LOGOUT (With Memory Cleanup)
// ────────────────────────────────────────────────────────────────

export async function logout() {
    vibrate();
    
    // Save theme preference before clearing
    const savedTheme = localStorage.getItem('theme');
    
    // ✅ CLEANUP MEMORY LEAKS
    try {
        // Stop timer interval (exposed from app.js)
        if (window.stopTimer) {
            window.stopTimer();
            console.log('🧹 Timer stopped');
        }
        
        // Clear any realtime subscriptions
        if (window.cleanupRealtime) {
            window.cleanupRealtime();
            console.log('🧹 Realtime cleaned');
        }
        
    } catch (cleanupError) {
        console.warn('Cleanup warning:', cleanupError);
    }
    
    try {
        // ✅ SUPABASE LOGOUT
        await db.auth.signOut();
        
        // ✅ CLEAR STATE
        state.user = null;
        state.userSettings = null;
        state.fleet = [];
        state.activeShift = null;
        
        // ✅ CLEAR STORAGE
        localStorage.clear();
        
        // ✅ RESTORE THEME
        if (savedTheme) {
            localStorage.setItem('theme', savedTheme);
        }
        
        showToast('Atsijungta sėkmingai', 'info');
        
        // ✅ RELOAD
        setTimeout(() => location.reload(), 500);
        
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ────────────────────────────────────────────────────────────────
// SESSION CHECK
// ────────────────────────────────────────────────────────────────

export async function checkSession() {
    try {
        const { data: { session }, error } = await db.auth.getSession();
        
        if (error) {
            console.error('Session check error:', error);
            return null;
        }
        
        return session;
        
    } catch (error) {
        console.error('Session check failed:', error);
        return null;
    }
}
