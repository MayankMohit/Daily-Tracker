"use client";

// Reactive connectivity flag for gating features that need the server (AI,
// export, app-lock changes, auth). Starts `true` so SSR and the first client
// render agree (no hydration mismatch), then syncs to `navigator.onLine` and
// tracks the online/offline events.

import { useEffect, useState } from "react";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
