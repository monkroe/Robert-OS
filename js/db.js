// ════════════════════════════════════════════════════════════════
// ROBERT OS - DB.JS v1.7.5 (DATABASE CONNECTION)
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy'
};

export let db = null;

export function initSupabase() {
    if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('pakeičiau')) {
        throw new Error('Konfigūracijos klaida: Nustatykite SUPABASE_URL db.js faile');
    }
    try {
        db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        console.log('🔌 DB: Inicializuota sėkmingai');
    } catch (err) {
        console.error('❌ DB Init Fail:', err);
        throw err;
    }
}
