// ════════════════════════════════════════════════════════════════
// ROBERT OS - SERVICE WORKER v1.7.2
// Smart Caching Strategy: Static Assets + Supabase Compatibility
// ════════════════════════════════════════════════════════════════

const CACHE_NAME = 'robert-os-v1.7.2';

// ⚠️ SVARBU: Naudojame reliatyvius kelius (./), kad veiktų GitHub Pages
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  
  // Core JS
  './js/app.js',
  './js/db.js',
  './js/state.js',
  './js/utils.js',
  
  // Modules
  './js/modules/auth.js',
  './js/modules/ui.js',
  './js/modules/shifts.js',
  './js/modules/settings.js',
  './js/modules/garage.js',
  './js/modules/finance.js',
  './js/modules/costs.js',
  
  // External CDN Dependencies (Šie gali likti absoliutūs URL)
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// ────────────────────────────────────────────────────────────────
// INSTALL
// ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('📦 [SW] Installing v1.7.2...');
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('💾 [SW] Caching assets...');
        return cache.addAll(ASSETS);
      })
      .then(() => console.log('✅ [SW] All assets cached'))
      .catch((err) => {
        console.error('❌ [SW] Cache failed. Check paths!', err);
        // Net jei cache nepavyksta, SW bandys veikti toliau
      })
  );
});

// ────────────────────────────────────────────────────────────────
// ACTIVATE
// ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  console.log('🔄 [SW] Activating v1.7.2...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`🗑️ [SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
    })
  );
  
  return self.clients.claim();
});

// ────────────────────────────────────────────────────────────────
// FETCH (Network First)
// ────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignore non-GET
  if (request.method !== 'GET') return;
  
  // Ignore Supabase API (Always Network)
  if (url.hostname.includes('supabase.co')) return;
  
  // Ignore chrome-extension schemes etc.
  if (!url.protocol.startsWith('http')) return;
  
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Check valid response
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        // Clone and Cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        
        return response;
      })
      .catch(() => {
        // Offline Fallback
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // SPA Fallback for navigation
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// ────────────────────────────────────────────────────────────────
// MESSAGE HANDLER
// ────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
