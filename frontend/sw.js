const CACHE = 'allmenus-v1';

const SHELL = [
  '/',
  '/index.html',
  '/menu-selection.html',
  '/restaurant-detail.html',
  '/login.html',
  '/signup.html',
  '/favorites.html',
  '/style.css',
  '/auth.js',
  '/function.js',
  '/detail.js',
  '/favorites.js',
  '/favicon/site.webmanifest',
  '/favicon/favicon.ico',
  '/favicon/apple-touch-icon.png',
  '/favicon/android-chrome-192x192.png',
  '/favicon/android-chrome-512x512.png',
  '/favicon/High-Resolution-Color-Logo-on-Transparent-Background.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Always go to network for API calls and external CDNs
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;

  // Cache-first for same-origin assets; update cache in background
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const fresh = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        });
        return cached || fresh;
      })
    )
  );
});
