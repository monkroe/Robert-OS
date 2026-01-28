// ════════════════════════════════════════════════════════════════
// ROBERT OS - DB.JS v2.0.0
// Logic: Database Connection & Integrity Check
// ════════════════════════════════════════════════════════════════

/**
 * ⚠️ SVARBU: Čia įrašyk savo Supabase duomenis.
 * Juos rasi: Supabase Project -> Settings -> API.
 */
const CONFIG = {
    SUPABASE_URL: 'https://sopcisskptiqlllehhgb.supabase.co',
    SUPABASE_KEY: 'sb_publishable_AqLNLewSuOEcbOVUFuUF-A_IWm9L6qy',
};

// ────────────────────────────────────────────────────────────────
// VALIDACIJA - Apsauga nuo "tylių" klaidų GitHub Pages aplinkoje
// ────────────────────────────────────────────────────────────────

if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('TAVO_')) {
    const errorMsg = '❌ DB ERROR: Supabase URL nekonfigūruotas!';
    console.error(errorMsg);
    alert(errorMsg); // Svarbu mobiliesiems, kur konsolė nematoma
    throw new Error('Missing database URL');
}

if (!CONFIG.SUPABASE_KEY || CONFIG.SUPABASE_KEY.length < 20) {
    const errorMsg = '❌ DB ERROR: Supabase API Key nekonfigūruotas!';
    console.error(errorMsg);
    alert(errorMsg);
    throw new Error('Missing database KEY');
}

// ────────────────────────────────────────────────────────────────
// KLIENTO INICIALIZAVIMAS
// ────────────────────────────────────────────────────────────────

/**
 * Naudojame globalų 'supabase' objektą, kuris užkraunamas 
 * per <script> tavo index.html faile.
 */
export const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// ────────────────────────────────────────────────────────────────
// RYŠIO TESTAS (Tik kūrimo/derinimo tikslams)
// ────────────────────────────────────────────────────────────────

(async function testConnection() {
    try {
        const { error } = await db.auth.getSession();
        if (error) {
            console.warn('⚠️ OS DB: Ryšio trikdžiai:', error.message);
        } else {
            console.log('%c✅ ROBERT OS v2.1: DB Connected', 'color: #14b8a6; font-weight: bold;');
        }
    } catch (err) {
        console.error('🔥 OS DB: Kritinė prisijungimo klaida. Patikrinkite internetą arba API raktus.');
    }
})();

export default db;
