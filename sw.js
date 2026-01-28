// ════════════════════════════════════════════════════════════════
// ROBERT OS - SERVICE WORKER v2.1.0
// Logic: Stale-While-Revalidate for Assets, Network Only for API
// ════════════════════════════════════════════════════════════════

const CACHE_NAME = 'robert-os-v2.1.0';

// Visų būtinų failų sąrašas (GitHub Pages struktūra)
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  // Pagrindiniai JS failai
  './js/app.js',
  './js/db.js',
  './js/state.js',
  './js/utils.js',
  // Moduliai (SVARBU: Github Pages reikalauja tikslių nuorodų)
  './js/modules/ui.js',
  './js/modules/shifts.js',
  './js/modules/finance.js',
  './js/modules/garage.js',
  // Išoriniai resursai
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// 1. INSTALL - Įrašome failus į telefono atmintį
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ OS CACHE: Užregistruoti visi moduliai');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. ACTIVATE - Išvalome senas versijas (kad neužimtų vietos)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim(); // Perimame valdymą iškart po aktyvavimo
});

// 3. FETCH - Protingas užklausų valdymas
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // ⚠️ SVARBU: Supabase API užklausų NIEKADA nekašuojame per SW.
  // Jos turi eiti tiesiai į serverį, kad matytum realius pinigus.
  if (url.hostname.includes('supabase.co')) {
    return; // Leidžiame naršyklei pačiai tvarkyti šias užklausas
  }

  // Strategija: Stale-While-Revalidate
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        // Jei gavome naują versiją - atnaujiname kešą fone
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkResponse;
      });

      // Grąžiname tai, ką turime atmintyje, arba laukiame tinklo
      return cachedResponse || fetchPromise;
    })
  );
});
