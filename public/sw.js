/* Daily Tracker service worker (plan §5 + offline support).
 *
 * Strategies:
 *  - App shell + static assets: stale-while-revalidate (instant loads, refresh
 *    in background).
 *  - Navigations (full document) AND RSC fetches (client-side <Link> nav):
 *    network-first, fall back to cache, then an offline page. Caching the RSC
 *    payloads is what lets SPA navigation work offline, not just hard reloads.
 *  - GET data APIs (tasks / logs / notes / mood / extras / journal / prefs):
 *    network-first with a cache fallback, so your data is viewable offline.
 *  - Non-GET requests are never cached here (mutations are handled by the app's
 *    IndexedDB outbox); on reconnect a Background Sync nudges the app to replay.
 */

const VERSION = "v2";
const SHELL_CACHE = `dt-shell-${VERSION}`;
const ASSET_CACHE = `dt-assets-${VERSION}`;
const DATA_CACHE = `dt-data-${VERSION}`;

const SHELL_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/manifest.webmanifest",
];

// Best-effort precache of the main routes so the first *offline* open works even
// for a page not visited this session. Done per-URL (not addAll) so one failure —
// e.g. an auth redirect — doesn't abort the whole install.
const PRECACHE_ROUTES = ["/", "/notes", "/journal", "/history", "/insights"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
      await Promise.all(
        PRECACHE_ROUTES.map(async (route) => {
          try {
            const res = await fetch(route, { credentials: "same-origin" });
            if (res.ok) await cache.put(route, res.clone());
          } catch {
            /* offline / redirect at install — runtime caching will pick it up */
          }
        }),
      );
    })(),
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

// GET data endpoints whose last response should be viewable offline.
function isCacheableData(url) {
  return (
    url.pathname.startsWith("/api/tasks") ||
    url.pathname.startsWith("/api/task-logs") ||
    url.pathname.startsWith("/api/notes") ||
    url.pathname.startsWith("/api/mood") ||
    url.pathname.startsWith("/api/extra-activities") ||
    url.pathname.startsWith("/api/journal") ||
    url.pathname.startsWith("/api/prefs")
  );
}

// A React Server Components fetch — Next's client router uses these for <Link>
// navigation. Identified by the RSC header or the `_rsc` cache-busting param.
function isRscRequest(request, url) {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
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

  if (isRscRequest(request, url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
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

// Background Sync: when connectivity returns, wake any open clients so the app
// drains its outbox. Progressive enhancement — browsers without Background Sync
// fall back to the app's own `online` event handler.
self.addEventListener("sync", (event) => {
  if (event.tag !== "outbox") return;
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
      for (const client of clients) client.postMessage({ type: "drain-outbox" });
    }),
  );
});
