// ════════════════════════════════════════════════════════════════
// ROBERT OS - SERVICE WORKER v1.7.2
// Smart Caching Strategy: Static Assets + Supabase Compatibility
// ════════════════════════════════════════════════════════════════

const CACHE_NAME = 'robert-os-v1.7.2'; // ✅ UPDATED

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  
  // Core JS
  '/js/app.js',
  '/js/db.js',
  '/js/state.js',
  '/js/utils.js',
  
  // Modules
  '/js/modules/auth.js',      // ✅ ADDED
  '/js/modules/ui.js',        // ✅ ADDED
  '/js/modules/shifts.js',
  '/js/modules/settings.js',
  '/js/modules/garage.js',
  '/js/modules/finance.js',
  '/js/modules/costs.js',
  
  // External CDN Dependencies
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' // ✅ CRITICAL
];

// ────────────────────────────────────────────────────────────────
// INSTALL: Cache all static assets
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
      .catch((err) => console.error('❌ [SW] Cache failed:', err))
  );
});

// ────────────────────────────────────────────────────────────────
// ACTIVATE: Clean up old caches
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
// FETCH: Smart caching strategy
// ────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // ─── BYPASS CONDITIONS ──────────────────────────────────────
  
  // Ignore non-GET requests
  if (request.method !== 'GET') return;
  
  // Ignore Supabase API calls (data must be fresh)
  if (url.hostname.includes('supabase.co')) return;
  
  // Ignore non-HTTP protocols
  if (!url.protocol.startsWith('http')) return;
  
  // ─── CACHING STRATEGY ───────────────────────────────────────
  
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        const responseToCache = response.clone();
        
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log(`📂 [SW] Serving from cache: ${url.pathname}`);
            return cachedResponse;
          }
          
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          
          return new Response('Offline - no cached version available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain',
            }),
          });
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
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      })
    );
  }
});
