"use client";

// Registers the service worker (plan §5). Only in production builds — in dev the
// SW would fight Turbopack's HMR and cache stale chunks.

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal */
      });
    };
    // By the time React hydrates, the window `load` event has usually already
    // fired — so register immediately if the document is ready, else wait.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
