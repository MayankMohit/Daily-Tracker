"use client";

// First-load timezone auto-detection.
//
// New users start with an empty `timezone` pref (see store/db `defaultUserPrefs`).
// On first load we detect the browser's IANA zone and save it — once — so the
// manual day-rollover (day boundary + 6 PM cutoff) lines up with the user's real
// clock without them having to open Settings. We only ever write when the stored
// zone is still empty, so a deliberate choice (including UTC) is never clobbered,
// even as the user travels. A per-browser localStorage flag skips the network
// round-trip on every subsequent load.

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { UserPrefs } from "@/lib/types";

const FLAG = "tzAutoDetected";

export function TimezoneSync() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (localStorage.getItem(FLAG)) return;

    let zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      /* Intl unavailable — nothing to detect */
    }
    if (!zone) return;

    (async () => {
      try {
        const prefs = await api.get<UserPrefs>("/api/prefs");
        if (!prefs.timezone) {
          await api.patch("/api/prefs", { timezone: zone });
          // Re-render server components so the day boundary uses the new zone.
          startTransition(() => router.refresh());
        }
        // Only mark done on success — a failure here (not signed in yet on an
        // auth page, offline) should retry on a later load, not be swallowed.
        localStorage.setItem(FLAG, "1");
      } catch {
        /* retry on a future load */
      }
    })();
  }, [router]);

  return null;
}
