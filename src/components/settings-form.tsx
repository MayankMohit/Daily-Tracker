"use client";

// Settings form (plan §3.6, §3.8, §8). Persists user prefs via /api/prefs. The
// AI section is stored now even though the AI layer is stubbed, so it's ready the
// moment a Gemini key is added.

import { useState } from "react";
import type { UserPrefs } from "@/lib/types";
import { api } from "@/lib/client";
import { Card, Field, inputClass, Button } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import { AppearanceSettings } from "./appearance-settings";

export function SettingsForm({ initial }: { initial: UserPrefs }) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [ai, setAi] = useState(initial.ai);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  // Auto-save: every control persists its own change immediately (partial patch;
  // the prefs schema treats each field as optional and merges server-side). No
  // Save button — a small status line reflects the last write.
  async function persist(patch: Record<string, unknown>) {
    setStatus("saving");
    try {
      await api.patch("/api/prefs", patch);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  function detectTimezone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(tz);
      persist({ timezone: tz });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <h3 className="text-sm font-medium">Appearance</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Theme</span>
          <ThemeToggle />
        </div>
        <div className="border-t border-border pt-4">
          <AppearanceSettings />
        </div>
      </Card>

      <Card className="space-y-4">
        <h3 className="text-sm font-medium">Timezone</h3>
        <Field
          label="Timezone"
          hint="Sets when your day starts and ends. Detected automatically on first visit."
        >
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              onBlur={() => persist({ timezone })}
              placeholder="e.g. America/New_York"
            />
            <Button type="button" variant="secondary" onClick={detectTimezone}>
              Detect
            </Button>
          </div>
        </Field>
      </Card>

      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">AI</h3>
          <p className="text-xs text-muted">
            Configure now — these take effect once a Gemini API key is added.
          </p>
        </div>

        <Field label="Tone">
          <select
            className={inputClass}
            value={ai.tone}
            onChange={(e) => {
              const next = { ...ai, tone: e.target.value as typeof ai.tone };
              setAi(next);
              persist({ ai: next });
            }}
          >
            <option value="encouraging">Encouraging</option>
            <option value="neutral">Neutral</option>
            <option value="blunt">Blunt</option>
          </select>
        </Field>
      </Card>

      <div className="h-5 text-sm">
        {status === "saving" && <span className="text-muted">Saving…</span>}
        {status === "saved" && <span className="text-success">Saved</span>}
        {status === "error" && (
          <span className="text-danger">Couldn’t save</span>
        )}
      </div>
    </div>
  );
}
