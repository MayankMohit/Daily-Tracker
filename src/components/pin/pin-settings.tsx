"use client";

// Settings card for the app-lock PIN (an optional privacy layer over Clerk). Reads
// its on/off status from GET /api/pin and lets the user enable, change, or turn it
// off. On enable/disable it broadcasts a window event so the PinGate and the navbar
// lock button react immediately, without waiting for a full reload.

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, Field, inputClass, Button } from "@/components/ui";

const PIN_RE = /^\d{4}$/;
type Mode = "idle" | "enabling" | "changing";

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
  const [mode, setMode] = useState<Mode>("idle");

  // Form fields (shared across enable/change flows).
  const [current, setCurrent] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ enabled: boolean }>("/api/pin")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  function resetForm() {
    setCurrent("");
    setPin1("");
    setPin2("");
    setError(null);
    setBusy(false);
    setMode("idle");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PIN_RE.test(pin1)) return setError("PIN must be exactly 4 digits.");
    if (pin1 !== pin2) return setError("The two PINs don't match.");
    if (mode === "changing" && !PIN_RE.test(current))
      return setError("Enter your current 4-digit PIN.");
    setBusy(true);
    try {
      await api.post(
        "/api/pin",
        mode === "changing" ? { current, pin: pin1 } : { pin: pin1 },
      );
      setEnabled(true);
      if (mode === "enabling") window.dispatchEvent(new Event("pin:enabled"));
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your PIN.");
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm("Turn off the app lock? You can re-enable it any time.")) return;
    setBusy(true);
    try {
      await api.del("/api/pin");
      setEnabled(false);
      window.dispatchEvent(new Event("pin:disabled"));
      resetForm();
    } catch {
      setError("Couldn't turn off the lock. Please try again.");
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

      {enabled === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : mode !== "idle" ? (
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
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted">
            {enabled ? "🔒 On" : "Off"}
          </span>
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
                <Button type="button" variant="danger" size="sm" onClick={disable}>
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
      )}
    </Card>
  );
}

function pinFieldWrapper(label: string, input: React.ReactNode) {
  return <Field label={label}>{input}</Field>;
}
