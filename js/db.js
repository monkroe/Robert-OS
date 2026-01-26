// ════════════════════════════════════════════════════════════════
// ROBERT OS - DB.JS v1.7.2
// Supabase Connection with Proper Initialization
// ════════════════════════════════════════════════════════════════

const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy'
};

// ────────────────────────────────────────────────────────────────
// VALIDATION
// ────────────────────────────────────────────────────────────────

function validateConfig() {
    if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('jūsų')) {
        console.error('❌ ROBERT OS: Supabase URL not configured!');
        console.error('📍 Update CONFIG.SUPABASE_URL in js/db.js');
        throw new Error('Missing SUPABASE_URL');
    }

    if (!CONFIG.SUPABASE_KEY || CONFIG.SUPABASE_KEY.includes('jūsų')) {
        console.error('❌ ROBERT OS: Supabase KEY not configured!');
        console.error('📍 Update CONFIG.SUPABASE_KEY in js/db.js');
        throw new Error('Missing SUPABASE_KEY');
    }
}

// ────────────────────────────────────────────────────────────────
// GLOBAL SUPABASE CLIENT (will be initialized)
// ────────────────────────────────────────────────────────────────

export let db = null;

// ────────────────────────────────────────────────────────────────
// INIT FUNCTION (called from app.js)
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
