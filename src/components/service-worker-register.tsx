"use client";

// Registers the service worker (plan §5). Only in production builds — in dev the
// SW would fight Turbopack's HMR and cache stale chunks.

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Ask the active worker to (re)cache every route's document for offline use.
    // Runs here — while the page is open and authenticated — because the install-
    // time fetch can miss under Clerk's auth handshake. Re-warms on reconnect so
    // freshly-changed pages are re-cached.
    const warm = () => {
      if (!navigator.onLine) return;
      navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage({ type: "warm-routes" }))
        .catch(() => {});
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(warm)
        .catch(() => {
          /* registration failures are non-fatal */
        });
    };
    // By the time React hydrates, the window `load` event has usually already
    // fired — so register immediately if the document is ready, else wait.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
    window.addEventListener("online", warm);
    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("online", warm);
    };
  }, []);

  return null;
}
