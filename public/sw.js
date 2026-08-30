const CACHE = 'bate-ponto-v1';
const ASSETS = ['/', '/styles.css', '/app.js', '/manifest.json', '/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET' && !event.request.url.includes('/api/')) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); });
