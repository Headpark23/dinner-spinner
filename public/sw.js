/* Dinner Spinner service worker.
 * - The app shell and built assets are cached so the app opens offline.
 * - Dish photos and fonts are cached as they are seen.
 * - /api is never cached: household data must always come from the server.
 * The build replaces VERSION with a hash of the built page, so it changes when the shell does. */
const VERSION = 'v3';
const SHELL = `ds-shell-${VERSION}`;
const ASSETS = `ds-assets-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']))
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

// A new version waits until the page asks for it (the "Refresh" notice), so nobody is reloaded mid-recipe.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// A vote notification sent by the server (someone suggested dinner, voted, or it's agreed).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Dinner Spinner', {
      body: data.body || '',
      tag: data.tag || 'dinner-spinner',
      renotify: true,
      icon: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/tonight' },
    })
  );
});

// Tapping a step reminder or vote notification brings the app forward (or opens it) on the Tonight screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        open.postMessage({ type: 'open-tonight', url: target });
        return open.focus();
      }
      return self.clients.openWindow(target);
    })
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
