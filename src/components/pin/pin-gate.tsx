"use client";

// App-lock PIN gate — an optional privacy layer over Clerk. Rendered once in the
// layout (inside <SignedIn>, so only post-auth). When the lock is on and this tab
// hasn't unlocked this session, it covers the whole app with an opaque, non-
// dismissible screen until the 4-digit PIN is entered.
//
// Why it re-locks on revisit: the "unlocked" marker lives in sessionStorage, which
// is per-tab and cleared when the tab/site is closed. So closing and reopening is a
// fresh load with no marker → locked again. A same-tab refresh keeps the marker →
// stays unlocked. It also auto-locks after the tab has been hidden/minimized for a
// grace period, and on a manual "Lock now" (a `pin:lock` window event).
//
// Security note (by design): this is a *client* screen backed by a server-verified,
// hashed, rate-limited PIN. It stops casual access to an already-signed-in session;
// it does not gate API/SSR data (Clerk already authorizes that).

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/client";
import { cn } from "@/lib/cn";

const UNLOCK_KEY = "pin-unlocked";
// Lock after the tab has been hidden/minimized this long (a quick tab-switch back
// within the window won't lock).
const GRACE_MS = 60_000;

function markUnlocked() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    /* storage unavailable — falls back to in-memory `locked` state only */
  }
}
function clearUnlocked() {
  try {
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}
function isUnlockedThisSession(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function PinGate({ initialEnabled }: { initialEnabled: boolean }) {
  const { isSignedIn } = useAuth();
  const [enabled, setEnabled] = useState(initialEnabled);
  // Start matching the SSR value (no hydration mismatch); a mount effect unlocks
  // this tab if it already unlocked this session.
  const [locked, setLocked] = useState(initialEnabled);

  const lock = useCallback(() => {
    clearUnlocked();
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    markUnlocked();
    setLocked(false);
  }, []);

  // On mount, reconcile with this tab's session (sessionStorage isn't readable
  // during SSR). Already unlocked here → drop the screen.
  useEffect(() => {
    if (enabled && isUnlockedThisSession()) setLocked(false);
  }, [enabled]);

  // Enable/disable happen in Settings; those cards broadcast so this gate (and the
  // navbar button) react without a full reload. Enabling shouldn't lock the user
  // out mid-session, so treat the current tab as unlocked.
  useEffect(() => {
    const onEnabled = () => {
      markUnlocked();
      setEnabled(true);
      setLocked(false);
    };
    const onDisabled = () => {
      clearUnlocked();
      setEnabled(false);
      setLocked(false);
    };
    const onLock = () => lock();
    window.addEventListener("pin:enabled", onEnabled);
    window.addEventListener("pin:disabled", onDisabled);
    window.addEventListener("pin:lock", onLock);
    return () => {
      window.removeEventListener("pin:enabled", onEnabled);
      window.removeEventListener("pin:disabled", onDisabled);
      window.removeEventListener("pin:lock", onLock);
    };
  }, [lock]);

  // Auto-lock after the tab is hidden/minimized for GRACE_MS. The timestamp check
  // on return is authoritative (background timers get throttled); the timer is a
  // best-effort proactive lock while still hidden.
  useEffect(() => {
    if (!enabled) return;
    let hiddenAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        timer = setTimeout(lock, GRACE_MS);
      } else {
        if (timer) clearTimeout(timer);
        if (hiddenAt && Date.now() - hiddenAt >= GRACE_MS) lock();
        hiddenAt = 0;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, lock]);

  // Freeze background scroll while the screen is up (matches Modal behaviour).
  useEffect(() => {
    if (!(enabled && locked)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [enabled, locked]);

  // Signed out (session ended client-side) → never show the screen.
  if (isSignedIn === false) return null;
  if (!enabled || !locked) return null;

  return <LockScreen onUnlock={unlock} onReset={resetWithCode} />;
}

// Reset (forgot PIN) proves ownership with the saved recovery code, then clears
// the server PIN and tells the rest of the app. Without the code the server
// refuses — so whoever holds the session can't clear the lock in a click.
async function resetWithCode(code: string) {
  await api.del("/api/pin", { resetToken: code });
  window.dispatchEvent(new Event("pin:disabled"));
}

function LockScreen({
  onUnlock,
  onReset,
}: {
  onUnlock: () => void;
  onReset: (code: string) => Promise<void>;
}) {
  // One real input drives four presentational boxes. A single input avoids the
  // per-box focus juggling (and the password-manager autofill that hijacks it),
  // and lets us auto-submit the moment the 4th digit lands.
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [shake, setShake] = useState(false);
  // "Forgot PIN?" opens an inline recovery-code prompt rather than resetting
  // outright — the code (saved when the lock was enabled) is what authorizes it.
  const [resetOpen, setResetOpen] = useState(false);
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a double-submit while a verify request is in flight. A ref (not
  // state) so it never disables the input — disabling it mid-request is what left
  // the field unfocusable and "stuck" after a wrong PIN.
  const inFlight = useRef(false);

  const focusInput = useCallback(() => {
    // After paint, so we focus the (re-enabled, cleared) input, not a stale one.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  const submit = useCallback(
    async (candidate: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      try {
        await api.patch("/api/pin", { pin: candidate });
        onUnlock();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Incorrect PIN");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPin("");
        focusInput();
      } finally {
        inFlight.current = false;
      }
    },
    [onUnlock, focusInput],
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (inFlight.current) return;
    const next = e.target.value.replace(/\D/g, "").slice(0, 4);
    setError(null);
    setPin(next);
    if (next.length === 4) submit(next);
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setError(null);
    setResetting(true);
    try {
      await onReset(trimmed);
      // Success dispatches `pin:disabled`, which unmounts this screen.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't reset — check the code.",
      );
      setResetting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-surface p-4">
      <div
        className={cn(
          "w-full max-w-xs space-y-6 text-center",
          shake && "animate-[shake_0.4s_ease-in-out]",
        )}
      >
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight">Locked</h1>
          <p className="text-sm text-muted">Enter your PIN to unlock the app.</p>
        </div>

        {/* The boxes are presentational; the transparent input on top captures all
            typing/paste and keeps focus, so clicking anywhere in the row focuses it. */}
        <label className="relative mx-auto block w-fit cursor-text">
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "grid h-14 w-12 place-items-center rounded-xl border bg-surface text-2xl transition-colors",
                  error
                    ? "border-danger"
                    : i === pin.length
                      ? "border-foreground/60"
                      : "border-border",
                )}
              >
                {pin[i] ? "•" : ""}
              </div>
            ))}
          </div>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            name="app-lock-pin"
            data-1p-ignore
            data-lpignore="true"
            maxLength={4}
            value={pin}
            onChange={onChange}
            aria-label="App lock PIN"
            className="absolute inset-0 h-full w-full cursor-text text-transparent opacity-0 outline-none"
          />
        </label>

        <div className="h-4 text-sm">
          {error && <span className="text-danger">{error}</span>}
        </div>

        {resetOpen ? (
          <form onSubmit={submitReset} className="space-y-2 text-left">
            <label className="block space-y-1">
              <span className="text-xs text-muted">
                Enter the recovery code you saved when you turned on the lock.
              </span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                placeholder="Recovery code"
                aria-label="Recovery code"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/60"
              />
            </label>
            <div className="flex justify-center gap-2">
              <button
                type="submit"
                disabled={resetting || !code.trim()}
                className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Reset lock"}
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={() => {
                  setResetOpen(false);
                  setCode("");
                  setError(null);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setResetOpen(true);
              setError(null);
            }}
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Forgot PIN?
          </button>
        )}
      </div>
    </div>
  );
}
