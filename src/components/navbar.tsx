"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  useAuth,
  useUser,
  useClerk,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/config";
import { dayKeyToDate } from "@/lib/date";
import type { ActiveDayState } from "@/lib/active-day";
import {
  syncActiveDay,
  advanceActiveDay,
  editPreviousDay,
} from "@/app/actions/active-day";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/notes", label: "Notes" },
  { href: "/journal", label: "Journal" },
  { href: "/history", label: "History" },
  { href: "/insights", label: "Insights" },
  { href: "/planner", label: "Day Planner" },
  { href: "/settings", label: "Settings" },
];

export function Navbar({
  activeDay,
  pinEnabled = false,
}: {
  activeDay: ActiveDayState;
  /** Whether the app-lock PIN is on — shows a "Lock now" button. */
  pinEnabled?: boolean;
}) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  // Track enable/disable done in Settings so the lock button appears/disappears
  // without a full reload (Settings broadcasts these events).
  const [locking, setLocking] = useState(pinEnabled);
  useEffect(() => {
    const on = () => setLocking(true);
    const off = () => setLocking(false);
    window.addEventListener("pin:enabled", on);
    window.addEventListener("pin:disabled", off);
    return () => {
      window.removeEventListener("pin:enabled", on);
      window.removeEventListener("pin:disabled", off);
    };
  }, []);

  // Hide the nav on the auth pages — they render Clerk's own centered card.
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex h-14 w-full items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-lg">
          <Image src="/icons/logo.png" alt={APP_NAME} width={40} height={40} className="rounded-md" priority unoptimized />
          <span className="translate-y-1 text-2xl">{APP_NAME}</span>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 text-sm md:flex">
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

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <DayControl initial={activeDay} />
          {/* Desktop keeps the light/dark toggle inline as before; on mobile it
              lives in Settings only. */}
          <span className="hidden md:inline-flex">
            <ThemeToggle />
          </span>
          {isSignedIn && locking && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("pin:lock"))}
              title="Lock the app now"
              aria-label="Lock the app now"
              className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
          )}

          {/* Desktop: profile / auth inline. On mobile these move into the menu. */}
          {isSignedIn ? (
            <span className="hidden md:inline-flex">
              <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
            </span>
          ) : (
            <div className="hidden items-center gap-2 text-sm md:flex">
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

          {/* Mobile-only: hamburger housing the nav links + profile/auth. */}
          <MobileMenu isSignedIn={Boolean(isSignedIn)} pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

/**
 * Mobile navigation menu (hidden on md+). A hamburger button opens a dropdown
 * holding the same links as the desktop centre nav, plus the profile/auth controls
 * that sit inline on desktop. Theme switching lives in Settings, not here.
 */
function MobileMenu({
  isSignedIn,
  pathname,
}: {
  isSignedIn: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // (Navigating closes the menu via each link's own onClick.)
  // Close on Escape or any click/tap outside the button + panel. A document
  // listener (not a fixed overlay) is used because the header's `backdrop-blur`
  // makes it a containing block — a `fixed inset-0` catcher would be trapped in
  // the 56px header and never cover the page below it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative md:hidden">
      <button
        ref={btnRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          {open ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <>
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 mt-3 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
            <nav className="flex flex-col">
              {NAV.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "px-3 py-2 text-sm transition-colors",
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

            <div className="mt-1 border-t border-border px-3 py-2">
              {isSignedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openUserProfile();
                  }}
                  className="flex w-full items-center gap-2 rounded-md text-sm text-muted transition-colors hover:text-foreground"
                >
                  {user?.imageUrl && (
                    <Image
                      src={user.imageUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full"
                      unoptimized
                    />
                  )}
                  <span>Account</span>
                </button>
              ) : (
                <div className="flex flex-col gap-2 text-sm">
                  <SignInButton mode="modal">
                    <button className="rounded-md px-3 py-1.5 text-left text-muted hover:bg-surface-2 hover:text-foreground">
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
      )}
    </div>
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

  // Recompute when the timezone changes in Settings — the day boundary and the
  // 6 PM cutoff (hence which button, if any, shows) are timezone-dependent.
  useEffect(() => {
    const onTimezoneChange = () => {
      syncActiveDay()
        .then((s) => setState(s))
        .catch(() => {});
      startTransition(() => router.refresh());
    };
    window.addEventListener("timezone:changed", onTimezoneChange);
    return () =>
      window.removeEventListener("timezone:changed", onTimezoneChange);
  }, [router]);

  const heldLabel = format(dayKeyToDate(state.effective), "EEE, MMM d");
  const nextLabel = format(dayKeyToDate(state.real), "MMM d");

  async function proceed() {
    setBusy(true);
    try {
      const s = await advanceActiveDay();
      setState(s);
      startTransition(() => router.refresh());
    } finally {
      // Always clear the spinner — on success the resulting state may still
      // render a button (e.g. "Edit yesterday" before the cutoff), so leaving
      // `busy` set would strand it disabled on "Loading…".
      setBusy(false);
    }
  }

  async function editYesterday() {
    setBusy(true);
    try {
      const s = await editPreviousDay();
      setState(s);
      startTransition(() => router.refresh());
    } finally {
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
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:px-3 sm:py-1.5"
        >
          {busy ? (
            "Advancing…"
          ) : (
            <>
              {/* Shorter label on phones where header space is tight. */}
              <span className="sm:hidden">Next day →</span>
              <span className="hidden sm:inline">Proceed to next date →</span>
            </>
          )}
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
      {busy ? (
        "Loading…"
      ) : (
        <>
          {/* Phones say "Write" since that's the primary action there. */}
          <span className="sm:hidden">← Yesterday</span>
          <span className="hidden sm:inline">← Edit yesterday</span>
        </>
      )}
    </button>
  );
}
