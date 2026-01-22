const CACHE_NAME = 'robert-os-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/js/app.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Instaliavimas: Išsaugome failus
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Veikimas: Pirmiausia rodome iš Cache (greitis), tada siunčiame užklausą
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
