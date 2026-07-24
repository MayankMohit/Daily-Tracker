"use client";

// Settings form (plan §3.6, §3.8, §8). Persists user prefs via /api/prefs. The
// AI section is stored now even though the AI layer is stubbed, so it's ready the
// moment a Gemini key is added.

import { useState } from "react";
import type { UserPrefs } from "@/lib/types";
import { api } from "@/lib/client";
import { Card, Field, inputClass, labelClass, Button } from "./ui";
import { ThemeToggle } from "./theme-toggle";

export function SettingsForm({ initial }: { initial: UserPrefs }) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [wake, setWake] = useState(initial.workingHours.wake);
  const [sleep, setSleep] = useState(initial.workingHours.sleep);
  const [ai, setAi] = useState(initial.ai);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  function detectTimezone() {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* ignore */
    }
  }

  async function save() {
    setStatus("saving");
    try {
      await api.patch("/api/prefs", {
        timezone,
        workingHours: { wake, sleep },
        ai,
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
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
      </Card>

      <Card className="space-y-4">
        <h3 className="text-sm font-medium">Time</h3>
        <Field
          label="Timezone"
          hint="Used to decide when a day starts and ends for you."
        >
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York"
            />
            <Button type="button" variant="secondary" onClick={detectTimezone}>
              Detect
            </Button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day starts (wake)">
            <input
              className={inputClass}
              type="time"
              value={wake}
              onChange={(e) => setWake(e.target.value)}
            />
          </Field>
          <Field label="Day ends (sleep)">
            <input
              className={inputClass}
              type="time"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">AI</h3>
          <p className="text-xs text-muted">
            Configure now — these take effect once a Gemini API key is added.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Summary frequency">
            <select
              className={inputClass}
              value={ai.frequency}
              onChange={(e) =>
                setAi({ ...ai, frequency: e.target.value as typeof ai.frequency })
              }
            >
              <option value="daily">Daily</option>
              <option value="daily+weekly">Daily + weekly</option>
              <option value="off">Off</option>
            </select>
          </Field>
          <Field label="Tone">
            <select
              className={inputClass}
              value={ai.tone}
              onChange={(e) =>
                setAi({ ...ai, tone: e.target.value as typeof ai.tone })
              }
            >
              <option value="encouraging">Encouraging</option>
              <option value="neutral">Neutral</option>
              <option value="blunt">Blunt</option>
            </select>
          </Field>
        </div>

        <div className="space-y-2">
          <Toggle
            label="Let AI read journal entries by default"
            checked={ai.journalInformedByDefault}
            onChange={(v) => setAi({ ...ai, journalInformedByDefault: v })}
          />
          <Toggle
            label="Surface mood–productivity insights"
            checked={ai.moodCorrelation}
            onChange={(v) => setAi({ ...ai, moodCorrelation: v })}
          />
          <Toggle
            label="Auto-tag extra activities (batched)"
            checked={ai.extraActivityAutoTag}
            onChange={(v) => setAi({ ...ai, extraActivityAutoTag: v })}
          />
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save settings"}
        </Button>
        {status === "saved" && (
          <span className="text-sm text-success">Saved</span>
        )}
        {status === "error" && (
          <span className="text-sm text-danger">Couldn’t save</span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={labelClass}>{label}</span>
    </label>
  );
}
