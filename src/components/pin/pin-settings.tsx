"use client";

// Settings card for the app-lock PIN (an optional privacy layer over Clerk). Reads
// its on/off status from GET /api/pin and lets the user enable, change, or turn it
// off. Enabling mints a one-time recovery code (shown once, to save) — the only way
// to reset a forgotten PIN. Turning the lock off requires the current PIN, so the
// removal path can't be used to bypass the lock. On enable/disable it broadcasts a
// window event so the PinGate and the navbar lock button react immediately.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, Field, inputClass, Button } from "@/components/ui";

const PIN_RE = /^\d{4}$/;
// idle → status row; enabling/changing → PIN form; disabling/recovery → single
// current-PIN form (to turn off / to mint a fresh recovery code).
type Mode = "idle" | "enabling" | "changing" | "disabling" | "recovery";

function pinField(value: string, onChange: (v: string) => void, placeholder: string) {
  return (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={4}
      className={inputClass}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
    />
  );
}

export function PinSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [hasCode, setHasCode] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  // When set, the freshly-minted recovery code is revealed once (enable / change-
  // backfill / regenerate). Takes over the card until acknowledged.
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  // Form fields (shared across flows).
  const [current, setCurrent] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ enabled: boolean; hasRecoveryCode: boolean }>("/api/pin")
      .then((r) => {
        setEnabled(r.enabled);
        setHasCode(r.hasRecoveryCode);
      })
      .catch(() => setEnabled(false));
  }, []);

  const resetForm = useCallback(() => {
    setCurrent("");
    setPin1("");
    setPin2("");
    setError(null);
    setBusy(false);
    setMode("idle");
  }, []);

  // The lock can also be enabled/disabled elsewhere — the lock-screen "forgot PIN"
  // reset, the navbar, or another open tab's action — all of which broadcast these
  // events. Sync to them so this card doesn't keep showing a stale "PIN on" after a
  // reset that happened while it was already mounted (e.g. behind the lock screen).
  useEffect(() => {
    const onDisabled = () => {
      setEnabled(false);
      setHasCode(false);
      setIssuedCode(null);
      resetForm();
    };
    const onEnabled = () => setEnabled(true);
    window.addEventListener("pin:disabled", onDisabled);
    window.addEventListener("pin:enabled", onEnabled);
    return () => {
      window.removeEventListener("pin:disabled", onDisabled);
      window.removeEventListener("pin:enabled", onEnabled);
    };
  }, [resetForm]);

  // Enable (first-time) or change an existing PIN.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PIN_RE.test(pin1)) return setError("PIN must be exactly 4 digits.");
    if (pin1 !== pin2) return setError("The two PINs don't match.");
    if (mode === "changing" && !PIN_RE.test(current))
      return setError("Enter your current 4-digit PIN.");
    setBusy(true);
    try {
      const { recoveryCode } = await api.post<{ recoveryCode: string | null }>(
        "/api/pin",
        mode === "changing" ? { current, pin: pin1 } : { pin: pin1 },
      );
      setEnabled(true);
      if (mode === "enabling") window.dispatchEvent(new Event("pin:enabled"));
      resetForm();
      // A code comes back on first enable — and when changing a pre-feature PIN
      // that never had one. Reveal it once; otherwise settle to the status row.
      if (recoveryCode) {
        setHasCode(true);
        setIssuedCode(recoveryCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your PIN.");
      setBusy(false);
    }
  }

  // Turn the lock off — requires the current PIN (server-enforced).
  async function submitDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PIN_RE.test(current)) return setError("Enter your current 4-digit PIN.");
    setBusy(true);
    try {
      await api.del("/api/pin", { pin: current });
      setEnabled(false);
      setHasCode(false);
      window.dispatchEvent(new Event("pin:disabled"));
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn off the lock.");
      setBusy(false);
    }
  }

  // Mint a fresh recovery code (invalidates the old one) — requires the current PIN.
  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PIN_RE.test(current)) return setError("Enter your current 4-digit PIN.");
    setBusy(true);
    try {
      const { recoveryCode } = await api.put<{ recoveryCode: string }>(
        "/api/pin",
        { pin: current },
      );
      resetForm();
      setHasCode(true);
      setIssuedCode(recoveryCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a code.");
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">App lock</h3>
        <p className="text-xs text-muted">
          Require a 4-digit PIN to open the app — an extra layer on top of sign-in.
          It re-locks when you close the site or leave it in the background.
        </p>
      </div>

      {issuedCode ? (
        <RecoveryReveal
          code={issuedCode}
          onDone={() => {
            setIssuedCode(null);
            resetForm();
          }}
        />
      ) : enabled === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : mode === "enabling" || mode === "changing" ? (
        <form onSubmit={submit} className="space-y-3">
          {mode === "changing" &&
            pinFieldWrapper("Current PIN", pinField(current, setCurrent, "Current PIN"))}
          {pinFieldWrapper(
            mode === "changing" ? "New PIN" : "Choose a PIN",
            pinField(pin1, setPin1, "4 digits"),
          )}
          {pinFieldWrapper("Confirm PIN", pinField(pin2, setPin2, "Re-enter PIN"))}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : mode === "changing" ? "Change PIN" : "Turn on lock"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={resetForm}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : mode === "disabling" || mode === "recovery" ? (
        <form
          onSubmit={mode === "disabling" ? submitDisable : submitRecovery}
          className="space-y-3"
        >
          <p className="text-xs text-muted">
            {mode === "disabling"
              ? "Enter your current PIN to turn off the app lock."
              : "Enter your current PIN to generate a new recovery code. This replaces any existing code."}
          </p>
          {pinFieldWrapper("Current PIN", pinField(current, setCurrent, "Current PIN"))}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              variant={mode === "disabling" ? "danger" : "primary"}
              disabled={busy}
            >
              {busy
                ? "Working…"
                : mode === "disabling"
                  ? "Turn off"
                  : "Generate code"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={resetForm}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted">{enabled ? "🔒 On" : "Off"}</span>
            <div className="flex gap-2">
              {enabled ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setMode("changing")}
                  >
                    Change PIN
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setMode("disabling")}
                  >
                    Turn off
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" onClick={() => setMode("enabling")}>
                  Enable
                </Button>
              )}
            </div>
          </div>

          {enabled && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Recovery code</p>
                <p className="text-xs text-muted">
                  {hasCode
                    ? "Used to reset your PIN if you forget it. Regenerate if you've lost it."
                    : "You don't have one yet — generate a code so you can reset a forgotten PIN."}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setMode("recovery")}
              >
                {hasCode ? "Regenerate" : "Generate"}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// One-time reveal of a freshly-minted recovery code. It's shown only here, right
// after it's created — the server keeps just a hash, so it can never be shown again.
function RecoveryReveal({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is selectable in the box below */
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <div>
        <h4 className="text-sm font-medium">Save your recovery code</h4>
        <p className="text-xs text-muted">
          This is the only way to reset your PIN if you forget it. It won&apos;t be
          shown again — store it somewhere safe, like a password manager.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm break-all">
          {code}
        </code>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Button type="button" size="sm" onClick={onDone}>
        I&apos;ve saved it
      </Button>
    </div>
  );
}

function pinFieldWrapper(label: string, input: React.ReactNode) {
  return <Field label={label}>{input}</Field>;
}
