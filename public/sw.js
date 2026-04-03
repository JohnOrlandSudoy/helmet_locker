const CACHE_NAME = 'helmet-locker-v2';
const APP_SHELL = ['/','/index.html','/manifest.json','/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          return (await caches.match('/index.html')) ?? Response.error();
        }
      })()
    );
    return;
  }

  if (url.pathname === '/manifest.json' || url.pathname === '/icon.svg') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' });
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(req)) ?? Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith((async () => (await caches.match(req)) ?? fetch(req))());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => (name !== CACHE_NAME ? caches.delete(name) : undefined)));
      await self.clients.claim();
    })()
  );
});
