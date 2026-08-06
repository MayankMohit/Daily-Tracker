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

// Full IANA timezone list for the picker, each labelled with its current UTC
// offset (e.g. "Asia/Kolkata (GMT+5:30)"). Built from the platform's own
// `Intl.supportedValuesOf` so it stays complete without a hardcoded list or
// extra dependency; computed once at module load.
function buildTimeZones(): { value: string; label: string }[] {
  let zones: string[] = [];
  try {
    const fn = (
      Intl as unknown as {
        supportedValuesOf?: (key: "timeZone") => string[];
      }
    ).supportedValuesOf;
    zones = fn ? fn("timeZone") : [];
  } catch {
    zones = [];
  }
  const now = new Date();
  return zones.map((value) => {
    let offset = "";
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: value,
        timeZoneName: "shortOffset",
      }).formatToParts(now);
      offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch {
      /* leave offset blank if the zone can't be formatted */
    }
    return { value, label: offset ? `${value} (${offset})` : value };
  });
}

const TIME_ZONE_OPTIONS = buildTimeZones();

export function SettingsForm({ initial }: { initial: UserPrefs }) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [ai, setAi] = useState(initial.ai);

  // Auto-save: every control persists its own change immediately (partial patch;
  // the prefs schema treats each field as optional and merges server-side). No
  // Save button and no status line — writes are silent.
  async function persist(patch: Record<string, unknown>) {
    try {
      await api.patch("/api/prefs", patch);
    } catch {
      /* ignore — the next change will retry the write */
    }
  }

  // Save a timezone, then let the navbar's day control recompute against it —
  // the day boundary and 6 PM cutoff are timezone-dependent. We broadcast only
  // after the write lands so the control's `syncActiveDay` reads the new value.
  async function saveTimezone(tz: string) {
    setTimezone(tz);
    await persist({ timezone: tz });
    window.dispatchEvent(new Event("timezone:changed"));
  }

  function detectTimezone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      saveTimezone(tz);
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
        <h3 className="text-sm font-medium">Preferences</h3>

        <Field label="Timezone" hint="Sets when your day starts and ends.">
          <div className="flex gap-2">
            <select
              className={inputClass}
              value={timezone}
              onChange={(e) => saveTimezone(e.target.value)}
            >
              {/* Keep a saved value that the platform doesn't list selectable. */}
              {timezone &&
                !TIME_ZONE_OPTIONS.some((t) => t.value === timezone) && (
                  <option value={timezone}>{timezone}</option>
                )}
              {TIME_ZONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={detectTimezone}>
              Detect
            </Button>
          </div>
        </Field>

        <Field label="AI tone">
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
    </div>
  );
}
