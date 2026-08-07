"use client";

// Desktop-only Week/Month switch for the dashboard's task-log table + graphs.
// It's rendered inside the table's "Task" header cell, which is already gated to
// `!isMobile`, so it never appears on phones (where the table collapses to today
// anyway). The choice is a persisted user pref (`dashboardRange`) read server-side
// by the dashboard page, so it sticks across reloads.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { DashboardRange } from "@/lib/types";
import { cn } from "@/lib/cn";

const OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 animate-spin"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DashboardRangeToggle({ range }: { range: DashboardRange }) {
  const router = useRouter();
  // Which value we're switching to, so its button shows the spinner. `isPending`
  // stays true for the whole async transition — the pref save *and* the ensuing
  // RSC refresh — and the old table stays on screen (dimmed) until it lands.
  const [pendingTo, setPendingTo] = useState<DashboardRange | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(next: DashboardRange) {
    if (next === range || isPending) return;
    setPendingTo(next);
    startTransition(async () => {
      try {
        // Persist first so the refresh re-reads the new window server-side.
        // Offline this queues in the outbox (harmless — the SSR view is cached).
        await api.patch("/api/prefs", { dashboardRange: next });
      } catch {
        // Swallow — a failed save just leaves the current view; user can retry.
      }
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-border bg-surface-2 p-0.5 transition-opacity",
        isPending && "opacity-80",
      )}
      role="group"
      aria-label="Dashboard window"
      aria-busy={isPending}
    >
      {OPTIONS.map((o) => {
        const active = range === o.value;
        const spinning = isPending && pendingTo === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            aria-pressed={active}
            disabled={isPending}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors",
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
              isPending && "cursor-wait",
            )}
          >
            {spinning && <Spinner />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
