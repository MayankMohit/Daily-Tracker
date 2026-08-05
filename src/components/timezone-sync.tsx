"use client";

// First-load timezone auto-detection.
//
// New users start with an empty `timezone` pref (see store/db `defaultUserPrefs`).
// On first load we detect the browser's IANA zone and save it — once — so the
// manual day-rollover (day boundary + 6 PM cutoff) lines up with the user's real
// clock without them having to open Settings.
//
// We key the "already detected?" decision off the *server* value for the signed-in
// user (passed in from the layout, which already loads prefs), NOT a per-browser
// localStorage flag. A browser-scoped flag was account-blind: once any account on a
// device had been detected, a freshly created account in the same browser was
// skipped and left with an empty zone. Reading the server value makes this correct
// per account, and it self-limits — once the zone is saved the prop is non-empty on
// the next render, so this never patches again (a deliberate choice, including UTC,
// is likewise preserved because the prop is then non-empty).

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function TimezoneSync({ timezone }: { timezone: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Already set (this account, on the server) — nothing to detect or save.
    if (timezone) return;

    let zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      /* Intl unavailable — nothing to detect */
    }
    if (!zone) return;

    (async () => {
      try {
        await api.patch("/api/prefs", { timezone: zone });
        // Re-render server components so the day boundary uses the new zone (and
        // so `timezone` comes back non-empty, stopping this from running again).
        startTransition(() => router.refresh());
      } catch {
        // Not signed in yet (auth page), offline, etc. — retry on a future load.
      }
    })();
  }, [timezone, router]);

  return null;
}
