// ════════════════════════════════════════════════════════════════
// ROBERT OS - SERVICE WORKER v2.2.1
// Logic: Stale-While-Revalidate for Assets, Network Only for API
// ════════════════════════════════════════════════════════════════

const CACHE_NAME = 'robert-os-v2.2.1';

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
  // Modules (all must be listed)
  './js/modules/ui.js',
  './js/modules/auth.js',
  './js/modules/shifts.js',
  './js/modules/finance.js',
  './js/modules/garage.js',
  './js/modules/settings.js',
  './js/modules/costs.js',
  // External CDN
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// 1. INSTALL
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ OS CACHE: Registering all modules');
        return cache.addAll(ASSETS);
      })
      .catch((err) => {
        console.error('❌ OS CACHE: Install failed', err);
      })
  );
});

// 2. ACTIVATE
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('🗑️ OS CACHE: Removing old cache', key);
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip Supabase API calls (always network)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Skip non-GET requests
  if (e.request.method !== 'GET') {
    return;
  }

  // Stale-While-Revalidate strategy
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // Fallback to cache on network error

      return cachedResponse || fetchPromise;
    })
  );
});
