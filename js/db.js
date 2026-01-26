// ════════════════════════════════════════════════════════════════
// ROBERT OS - DB.JS v1.5.0
// Database Connection & Configuration
// ════════════════════════════════════════════════════════════════

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy',
};

// ────────────────────────────────────────────────────────────────
// VALIDATION - Prevents silent failures
// ────────────────────────────────────────────────────────────────

if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL === 'JŪSŲ_URL_ČIA') {
    console.error('❌ ROBERT OS: Supabase URL not configured!');
    console.error('📍 Please update CONFIG.SUPABASE_URL in js/db.js');
    throw new Error('Database configuration error: Missing SUPABASE_URL');
}

if (!CONFIG.SUPABASE_KEY || CONFIG.SUPABASE_KEY === 'JŪSŲ_KEY_ČIA') {
    console.error('❌ ROBERT OS: Supabase KEY not configured!');
    console.error('📍 Please update CONFIG.SUPABASE_KEY in js/db.js');
    throw new Error('Database configuration error: Missing SUPABASE_KEY');
}

// ────────────────────────────────────────────────────────────────
// CREATE CLIENT
// ────────────────────────────────────────────────────────────────

export const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// ────────────────────────────────────────────────────────────────
// CONNECTION CHECK (Optional - helps debug production issues)
// ────────────────────────────────────────────────────────────────

db.auth.getSession()
    .then(({ data, error }) => {
        if (error) {
            console.warn('⚠️ ROBERT OS: Database connection issue');
            console.warn('Details:', error.message);
        } else {
            console.log('✅ ROBERT OS v1.5.0: Database connected');
        }
    })
    .catch(err => {
        console.error('❌ ROBERT OS: Fatal database error');
        console.error('Details:', err);
    });
