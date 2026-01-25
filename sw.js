// ════════════════════════════════════════════════════════════════
// ROBERT OS - SERVICE WORKER v1.7.1
// Smart Caching Strategy: Static Assets + Supabase Compatibility
// ════════════════════════════════════════════════════════════════

const CACHE_NAME = 'robert-os-v1.7.1';

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
  '/js/modules/shifts.js',
  '/js/modules/settings.js',
  '/js/modules/garage.js',
  '/js/modules/finance.js',
  '/js/modules/costs.js',
  
  // External CDN Dependencies
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' // ✅ CRITICAL FIX
];

// ────────────────────────────────────────────────────────────────
// INSTALL: Cache all static assets
// ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('📦 [SW] Installing v1.7.1...');
  self.skipWaiting(); // Activate immediately
  
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
  console.log('🔄 [SW] Activating v1.7.1...');
  
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
  
  return self.clients.claim(); // Take control immediately
});

// ────────────────────────────────────────────────────────────────
// FETCH: Smart caching strategy
// ────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // ─── BYPASS CONDITIONS ──────────────────────────────────────
  
  // 1. Ignore non-GET requests (POST, PUT, DELETE, PATCH)
  if (request.method !== 'GET') {
    return; // Let it pass through
  }
  
  // 2. Ignore Supabase API calls (data should always be fresh)
  if (url.hostname.includes('supabase.co')) {
    return; // Let Supabase handle its own network
  }
  
  // 3. Ignore chrome-extension:// and other special protocols
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // ─── CACHING STRATEGY ───────────────────────────────────────
  
  event.respondWith(
    // Network First (for fresh content)
    fetch(request)
      .then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        // Clone the response (can only be read once)
        const responseToCache = response.clone();
        
        // Update cache in background
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log(`📂 [SW] Serving from cache: ${url.pathname}`);
            return cachedResponse;
          }
          
          // If it's a navigation request and we have no cache, show offline page
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          
          // For other requests, return a generic error
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
// MESSAGE HANDLER (for manual cache updates)
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
