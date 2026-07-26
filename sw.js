// Watchtower service worker.
// Deliberately conservative: the app is live-data-driven, so nothing dynamic is
// ever served from cache. Network always wins; the cache exists only so the app
// opens (rather than showing the browser's offline error) when the network is
// down, and so the install criteria for Chrome/TWA are satisfied.

const VERSION = 'wt-v2';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

// Shell assets that are safe to serve from cache first — they change only on deploy.
const STATIC_ASSETS = [
  '/icon-1.png',
  '/icon-192.png',
  '/icon-maskable-512.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Anything that carries live state must never be cached: Supabase reads reflect
// RLS-scoped data per user, and /api routes have side effects.
function isLiveData(url) {
  return url.pathname.startsWith('/api/')
    || url.hostname.endsWith('.supabase.co')
    || url.hostname.endsWith('.supabase.in');
}

// Only immutable-ish assets may be served cache-first. Everything else — notably
// HTML fetched programmatically, which is NOT request.mode 'navigate' and would
// otherwise land here and go stale — falls through to the network untouched.
function isStaticAsset(url) {
  if (url.pathname === '/sw.js') return false;
  return /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|css)$/i.test(url.pathname)
    || url.pathname === '/manifest.json';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // The Cache API only stores GET. Everything else goes straight to the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isLiveData(url)) return;
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, so a deploy is picked up immediately. Fall back
  // to the last-seen copy of that page only when the network actually fails.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Everything else that isn't an explicitly-listed static asset goes to the
  // network with no service worker involvement at all.
  if (!isStaticAsset(url)) return;

  // Static shell assets: cache-first, refreshed in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
