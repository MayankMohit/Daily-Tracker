"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import { useAuth, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/config";
import { dayKeyToDate } from "@/lib/date";
import type { ActiveDayState } from "@/lib/active-day";
import {
  syncActiveDay,
  advanceActiveDay,
  editPreviousDay,
} from "@/app/actions/active-day";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/notes", label: "Notes" },
  { href: "/journal", label: "Journal" },
  { href: "/history", label: "History" },
  { href: "/insights", label: "Insights" },
  { href: "/planner", label: "Day Planner" },
  { href: "/settings", label: "Settings" },
];

export function Navbar({ activeDay }: { activeDay: ActiveDayState }) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  // Hide the nav on the auth pages — they render Clerk's own centered card.
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex h-14 w-full items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-lg">
          <Image src="/icons/logo.png" alt={APP_NAME} width={40} height={40} className="rounded-md" priority unoptimized />
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <DayControl initial={activeDay} />
          <ThemeToggle />
          {isSignedIn ? (
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <SignInButton mode="modal">
                <button className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-md bg-accent px-3 py-1.5 text-accent-foreground hover:opacity-90">
                  Sign up
                </button>
              </SignUpButton>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Overnight day-rollover control. When the calendar date has moved ahead but the
 * app is still holding the previous day (so you can finish that day's journal and
 * logs), this shows a button to advance. It also persists the day anchor on mount
 * so the hold reliably triggers after midnight. Auto-advances at 6 PM regardless.
 *
 * On a normal (non-held) day, before the 6 PM cutoff, it instead offers an "Edit
 * yesterday" jump — holding the app back on the previous day so its cells become
 * editable. After 6 PM that option disappears (the day has auto-advanced).
 */
function DayControl({ initial }: { initial: ActiveDayState }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  // Keep the cookie anchored to the effective day during normal use.
  useEffect(() => {
    syncActiveDay()
      .then((s) => setState(s))
      .catch(() => {});
  }, []);

  const heldLabel = format(dayKeyToDate(state.effective), "EEE, MMM d");
  const nextLabel = format(dayKeyToDate(state.real), "MMM d");

  async function proceed() {
    setBusy(true);
    try {
      const s = await advanceActiveDay();
      setState(s);
      startTransition(() => router.refresh());
    } catch {
      setBusy(false);
    }
  }

  async function editYesterday() {
    setBusy(true);
    try {
      const s = await editPreviousDay();
      setState(s);
      startTransition(() => router.refresh());
    } catch {
      setBusy(false);
    }
  }

  if (state.held) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="hidden text-xs text-muted md:inline"
          title={`The app is still on ${heldLabel}. It advances to ${nextLabel} automatically at 6 PM.`}
        >
          📌 On {heldLabel}
        </span>
        <button
          type="button"
          onClick={proceed}
          disabled={busy}
          title={`Move to ${nextLabel}. Do this once you're done logging ${heldLabel}.`}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Advancing…" : "Proceed to next date →"}
        </button>
      </div>
    );
  }

  // Not held: offer "Edit yesterday" while it's still before the 6 PM cutoff.
  if (!state.beforeCutoff) return null;

  const prevLabel = format(dayKeyToDate(state.real), "MMM d"); // real - 1 shown after click
  return (
    <button
      type="button"
      onClick={editYesterday}
      disabled={busy}
      title={`Jump back to yesterday to fix its logs. Available until 6 PM, after which ${prevLabel} closes.`}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
    >
      {busy ? "Loading…" : "← Edit yesterday"}
    </button>
  );
}
