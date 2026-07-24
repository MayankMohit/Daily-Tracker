/* Daily Tracker service worker (plan §5).
 *
 * Strategies:
 *  - App shell + static assets: stale-while-revalidate (instant loads, refresh
 *    in background).
 *  - Navigations: network-first, fall back to cache, then an offline page.
 *  - GET data APIs (tasks / task-logs): network-first with a cache fallback, so
 *    today's task list is viewable offline.
 *  - Non-GET requests are never cached (mutations always hit the network).
 */

const VERSION = "v1";
const SHELL_CACHE = `dt-shell-${VERSION}`;
const ASSET_CACHE = `dt-assets-${VERSION}`;
const DATA_CACHE = `dt-data-${VERSION}`;

const SHELL_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![SHELL_CACHE, ASSET_CACHE, DATA_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(css|js|woff2?|png|jpg|jpeg|svg|ico)$/.test(url.pathname)
  );
}

function isCacheableData(url) {
  return (
    url.pathname.startsWith("/api/tasks") ||
    url.pathname.startsWith("/api/task-logs") ||
    url.pathname.startsWith("/api/prefs")
  );
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) return caches.match(fallback);
    throw new Error("offline and no cache");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache mutations

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/offline.html"));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }
  if (isCacheableData(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
});
