// ════════════════════════════════════════════════════════════════
// ROBERT OS - DB.JS v1.7.4 (STANDALONE ESM)
// ════════════════════════════════════════════════════════════════

// 1. TIESIOGINIS IMPORTAS (Pamirštame window.supabaseClient)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy'
};

export let db = null;

export function initSupabase() {
    console.log('🔌 Initializing Supabase (Standalone Mode)...');
    
    if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('pakeičiau')) {
        throw new Error('Klaida: Nenustatytas SUPABASE_URL db.js faile.');
    }

    try {
        // Naudojame tiesiogiai importuotą funkciją
        db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        console.log('✅ Database: Connection established.');
    } catch (err) {
        console.error('❌ Database Initialization Failed:', err);
        throw err;
    }
}

// Papildomos pagalbinės funkcijos lieka tokios pačios...
export async function isAuthenticated() {
    if (!db) return false;
    const { data: { session } } = await db.auth.getSession();
    return !!session;
}
