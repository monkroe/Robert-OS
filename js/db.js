// ════════════════════════════════════════════════════════════════
// ROBERT OS - DB.JS v1.7.3 (FIXED FOR ESM)
// ════════════════════════════════════════════════════════════════

const CONFIG = {
    // Užtikrinkite, kad šie kintamieji būtų teisingi tavo Supabase projekte
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy'
};

export let db = null;

function validateConfig() {
    if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('pakeičiau')) {
        console.error('❌ ROBERT OS: Supabase URL nekonfigūruotas!');
        throw new Error('Missing SUPABASE_URL');
    }
    if (!CONFIG.SUPABASE_KEY || CONFIG.SUPABASE_KEY.includes('pakeičiau')) {
        console.error('❌ ROBERT OS: Supabase KEY nekonfigūruotas!');
        throw new Error('Missing SUPABASE_KEY');
    }
}

export function initSupabase() {
    console.log('🔌 Initializing Supabase connection...');
    
    validateConfig();
    
    // ROOT CAUSE FIX 1: Tikriname kintamąjį, kurį sukūrėme index.html
    const createClientFunc = window.supabaseClient;
    
    if (typeof createClientFunc !== 'function') {
        console.error('❌ Supabase SDK nerastas! Patikrinkite index.html ESM importą.');
        throw new Error('Supabase library not found');
    }
    
    // ROOT CAUSE FIX 2: Kviečiame pačią funkciją tiesiogiai
    try {
        db = createClientFunc(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        console.log('✅ Supabase client initialized');
        
        // Paleidžiame asynchrone patikrą fone
        testConnection();
    } catch (err) {
        console.error('❌ Klaida inicializuojant DB klientą:', err);
        throw err;
    }
}

async function testConnection() {
    try {
        const { data, error } = await db.auth.getSession();
        if (error) throw error;
        console.log('✅ Database connection verified');
    } catch (err) {
        console.warn('⚠️ DB Connection Test Warning:', err.message);
        // Čia netrow'inam, kad neužmuštume programos dėl laikino tinklo dingimo
    }
}

export async function getCurrentUser() {
    if (!db) throw new Error('Database not initialized');
    const { data: { user }, error } = await db.auth.getUser();
    if (error) throw error;
    return user;
}

export async function isAuthenticated() {
    if (!db) return false;
    const { data: { session } } = await db.auth.getSession();
    return !!session;
}
// ────────────────────────────────────────────────────────────────

export function initSupabase() {
    console.log('🔌 Initializing Supabase connection...');
    
    // Validate config first
    validateConfig();
    
    // Check if Supabase library is loaded
    if (typeof window.supabase === 'undefined') {
        console.error('❌ Supabase library not loaded!');
        console.error('📍 Ensure <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> is in index.html');
        throw new Error('Supabase library not found');
    }
    
    // Create client from global window.supabase
    db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    
    // Test connection
    testConnection();
    
    console.log('✅ Supabase client initialized');
}

// ────────────────────────────────────────────────────────────────
// CONNECTION TEST
// ────────────────────────────────────────────────────────────────

async function testConnection() {
    try {
        const { data, error } = await db.auth.getSession();
        
        if (error) {
            console.warn('⚠️ Supabase connection warning:', error.message);
        } else {
            console.log('✅ Database connection verified');
        }
    } catch (err) {
        console.error('❌ Database connection failed:', err);
        throw err;
    }
}

// ────────────────────────────────────────────────────────────────
// HELPER: Get authenticated user
// ────────────────────────────────────────────────────────────────

export async function getCurrentUser() {
    if (!db) {
        throw new Error('Database not initialized. Call initSupabase() first.');
    }
    
    const { data: { user }, error } = await db.auth.getUser();
    
    if (error) throw error;
    return user;
}

// ────────────────────────────────────────────────────────────────
// HELPER: Check if authenticated
// ────────────────────────────────────────────────────────────────

export async function isAuthenticated() {
    if (!db) return false;
    
    const { data: { session } } = await db.auth.getSession();
    return !!session;
}
