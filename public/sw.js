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

const VERSION = "v6";
const SHELL_CACHE = `dt-shell-${VERSION}`;
const ASSET_CACHE = `dt-assets-${VERSION}`;
const DATA_CACHE = `dt-data-${VERSION}`;

const SHELL_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/logo.png",
  "/manifest.webmanifest",
];

// Best-effort precache of the main routes so the first *offline* open works even
// for a page not visited this session. Done per-URL (not addAll) so one failure —
// e.g. an auth redirect — doesn't abort the whole install.
const PRECACHE_ROUTES = [
  "/",
  "/notes",
  "/journal",
  "/history",
  "/insights",
  "/settings",
  "/planner",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
      await warmRoutes(cache);
    })(),
  );
  self.skipWaiting();
});

// Warm the cache for each app route so its first *offline* open works even if it
// wasn't visited this session. We cache two things per route:
//   • the HTML document — used when a full navigation falls back offline;
//   • the full RSC payload — used for client-side (<Link>) navigation. Fetched
//     WITHOUT the Next-Router-Prefetch header so we get the real page, not the
//     loading-skeleton a prefetch returns for a dynamic route (that skeleton is
//     why an unvisited page like the planner could dead-end at the offline page).
// Per-route best-effort; skips redirects so an auth handshake/sign-in response is
// never cached in place of a real page.
async function warmRoutes(cache) {
  const dataCache = await caches.open(DATA_CACHE);
  await Promise.all(
    PRECACHE_ROUTES.map(async (route) => {
      try {
        const res = await fetch(route, { credentials: "same-origin" });
        if (res.ok && !res.redirected) await cache.put(route, res.clone());
      } catch {
        /* offline right now — the client re-warms once back online */
      }
      try {
        const rsc = await fetch(route, {
          credentials: "same-origin",
          headers: { RSC: "1" },
        });
        if (rsc.ok && !rsc.redirected) {
          await dataCache.put(rscKey(new URL(route, self.location.origin)), rsc.clone());
        }
      } catch {
        /* best-effort */
      }
    }),
  );
}

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

// RSC requests carry a per-navigation `?_rsc=<hash>` that changes between
// prefetch and navigation, so caching them by full URL would miss on every
// offline navigation. Key them by pathname instead (stable per route).
function rscKey(url) {
  return url.origin + url.pathname + "#rsc";
}

async function rscNetworkFirst(request, url) {
  const cache = await caches.open(DATA_CACHE);
  const key = rscKey(url);
  // Don't cache prefetches: for a dynamic route they return only the loading
  // skeleton, which would clobber the full RSC warmed for offline use.
  const isPrefetch = request.headers.get("Next-Router-Prefetch") === "1";
  try {
    const res = await fetch(request);
    if (res.ok && !isPrefetch) cache.put(key, res.clone());
    return res;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    // No cached RSC → let it fail so Next falls back to a full navigation, which
    // the navigate handler serves from the cached document (or the offline page).
    throw new Error("offline and no rsc cache");
  }
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
    event.respondWith(rscNetworkFirst(request, url));
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

// Client-triggered cache warming. Runs while the app is open and authenticated
// (more reliable than the install-time fetch under Clerk auth), so every route's
// document is cached for offline use even before the user visits it.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm-routes") {
    event.waitUntil(caches.open(SHELL_CACHE).then((cache) => warmRoutes(cache)));
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
