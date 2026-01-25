// ════════════════════════════════════════════════════════════════
// ROBERT OS - AUTH MODULE v1.5.0
// Authentication with Memory Cleanup
// ════════════════════════════════════════════════════════════════

import { db } from '../db.js';
import { showToast, vibrate } from '../utils.js';

// ────────────────────────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────────────────────────

export async function login() {
    vibrate();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    
    if (!email || !password) {
        return showToast('Įveskite email ir slaptažodį', 'error');
    }
    
    const { error } = await db.auth.signInWithPassword({ email, password });
    
    if (error) {
        showToast(error.message, 'error');
    } else {
        location.reload();
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
        // 1. Cleanup realtime channels
        if (window.cleanupRealtime) {
            window.cleanupRealtime();
            console.log('🧹 Realtime channels cleaned');
        }
        
        // 2. Cleanup state listeners
        if (window.cleanupStateListeners) {
            window.cleanupStateListeners();
            console.log('🧹 State listeners cleaned');
        }
        
        // 3. Stop any running timers (if exposed)
        if (window.Shifts && window.Shifts.stopTimer) {
            window.Shifts.stopTimer();
        }
        
    } catch (cleanupError) {
        console.warn('Cleanup warning:', cleanupError);
        // Don't block logout on cleanup errors
    }
    
    // ✅ SUPABASE LOGOUT
    await db.auth.signOut();
    
    // ✅ CLEAR STORAGE
    localStorage.clear();
    
    // ✅ RESTORE THEME
    if (savedTheme) {
        localStorage.setItem('theme', savedTheme);
    }
    
    // ✅ RELOAD
    location.reload();
}

// ────────────────────────────────────────────────────────────────
// SESSION CHECK (Optional helper)
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

// ────────────────────────────────────────────────────────────────
// AUTO-REFRESH TOKEN (Optional)
// ────────────────────────────────────────────────────────────────

export function setupAuthListener() {
    db.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            console.log('🔓 User signed out');
            // Could redirect to login if needed
        } else if (event === 'SIGNED_IN') {
            console.log('🔐 User signed in:', session?.user?.email);
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('🔄 Token refreshed');
        }
    });
}
