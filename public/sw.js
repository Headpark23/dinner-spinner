/* Dinner Spinner service worker.
 * - The app shell and built assets are cached so the app opens offline.
 * - Dish photos and fonts are cached as they are seen.
 * - /api is never cached: household data must always come from the server.
 * Bump VERSION to force every device to refresh its cache. */
const VERSION = 'v1';
const SHELL = `ds-shell-${VERSION}`;
const ASSETS = `ds-assets-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Pages: network first, fall back to the cached app shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // Built files, fonts, photos, icons: cache first, then network (and remember it).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || /\.(woff2|png|jpe?g|webp|svg|webmanifest)$/.test(url.pathname))) {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
