"use client";

// Today's journal entry with the opt-in AI-read toggle (plan §3.3). Autosaves on
// blur; the toggle controls whether this day's text can be fed to the AI later.

import { useState, useRef } from "react";
import type { JournalEntry } from "@/lib/types";
import { api } from "@/lib/client";
import type { DayKey } from "@/lib/date";
import { Card, inputClass } from "./ui";
import { cn } from "@/lib/cn";

export function JournalBox({
  date,
  initial,
  aiDefault,
}: {
  date: DayKey;
  initial: JournalEntry | null;
  aiDefault: boolean;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [allowAiRead, setAllowAiRead] = useState(
    initial?.allowAiRead ?? aiDefault,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const lastSaved = useRef(initial?.text ?? "");

  async function save(nextText: string, nextAi: boolean) {
    setStatus("saving");
    try {
      await api.post("/api/journal", {
        date,
        text: nextText,
        allowAiRead: nextAi,
      });
      lastSaved.current = nextText;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("idle");
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Journal</h3>
        <span className="text-xs text-muted">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
        </span>
      </div>

      <textarea
        className={cn(inputClass, "h-28 py-2 leading-relaxed")}
        placeholder="How did today go?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== lastSaved.current) save(text, allowAiRead);
        }}
      />

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={allowAiRead}
          onChange={(e) => {
            setAllowAiRead(e.target.checked);
            save(text, e.target.checked);
          }}
        />
        Let AI read this entry for daily summaries
      </label>
    </Card>
  );
}
