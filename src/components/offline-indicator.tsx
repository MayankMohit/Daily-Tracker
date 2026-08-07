"use client";

// Offline status pill + the sync driver. Shows when you're offline and/or have
// unsynced changes waiting, and kicks the outbox drain on reconnect. Rendered
// once in the root layout.
//
// It stays out of the way: nothing renders while you're online with an empty
// queue. Starts in that hidden state so the server HTML and first client render
// match (no hydration mismatch), then syncs to reality in an effect.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { outboxCount, OUTBOX_CHANGED, OUTBOX_DRAINED } from "@/lib/offline/outbox";
import { startOfflineSync } from "@/lib/offline/sync";
import { cn } from "@/lib/cn";

export function OfflineIndicator() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    startOfflineSync();

    const syncOnline = () => setOnline(navigator.onLine);
    const refreshCount = () => void outboxCount().then(setPending);

    syncOnline();
    refreshCount();

    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    window.addEventListener(OUTBOX_CHANGED, refreshCount);
    // A completed drain: clear the badge and pull authoritative server data so
    // any `local-…` ids from offline creates are replaced with real ones.
    const onDrained = () => {
      refreshCount();
      router.refresh();
    };
    window.addEventListener(OUTBOX_DRAINED, onDrained);

    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
      window.removeEventListener(OUTBOX_CHANGED, refreshCount);
      window.removeEventListener(OUTBOX_DRAINED, onDrained);
    };
  }, [router]);

  if (online && pending === 0) return null;

  const label = !online
    ? pending > 0
      ? `Offline — ${pending} change${pending === 1 ? "" : "s"} will sync`
      : "Offline"
    : `Syncing ${pending} change${pending === 1 ? "" : "s"}…`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur",
          online
            ? "border-accent/40 bg-accent/10 text-foreground"
            : "border-border bg-surface-2/90 text-muted",
        )}
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            online ? "animate-pulse bg-accent" : "bg-muted",
          )}
        />
        {label}
      </div>
    </div>
  );
}
