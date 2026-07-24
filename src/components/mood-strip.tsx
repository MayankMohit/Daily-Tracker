"use client";

// Compact mood row (plan §6). Shows the recent days and lets the user set today's
// mood with a 1–5 emoji scale.

import { useState } from "react";
import type { MoodLog } from "@/lib/types";
import { api } from "@/lib/client";
import { shortDayLabel, isToday, type DayKey } from "@/lib/date";
import { cn } from "@/lib/cn";
import { Card } from "./ui";

export const MOODS = [
  { value: 1, emoji: "😞", label: "Awful" },
  { value: 2, emoji: "🙁", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

export function MoodStrip({
  dates,
  today,
  initialMoods,
}: {
  dates: DayKey[];
  today: DayKey;
  initialMoods: MoodLog[];
}) {
  const [moods, setMoods] = useState<Map<DayKey, number>>(() => {
    const m = new Map<DayKey, number>();
    for (const x of initialMoods) m.set(x.date, x.mood);
    return m;
  });

  async function setToday(mood: number) {
    const prev = moods.get(today);
    setMoods((m) => new Map(m).set(today, mood));
    try {
      await api.post("/api/mood", { date: today, mood });
    } catch {
      setMoods((m) => {
        const next = new Map(m);
        if (prev) next.set(today, prev);
        else next.delete(today);
        return next;
      });
    }
  }

  const todayMood = moods.get(today);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Mood</h3>
        <span className="text-xs text-muted">How was today?</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setToday(m.value)}
            title={m.label}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border text-lg transition-colors",
              todayMood === m.value
                ? "border-accent bg-accent/10"
                : "border-border hover:bg-surface-2",
            )}
          >
            {m.emoji}
          </button>
        ))}
      </div>

      {/* Recent history */}
      <div className="flex gap-1.5 overflow-x-auto pt-1">
        {dates.map((d) => {
          const mood = moods.get(d);
          const face = mood ? MOODS[mood - 1].emoji : "·";
          return (
            <div
              key={d}
              className="flex min-w-[44px] flex-col items-center gap-1"
              title={d}
            >
              <div
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-md text-base",
                  mood ? "bg-surface-2" : "text-border",
                  isToday(d) && "ring-1 ring-accent",
                )}
              >
                {face}
              </div>
              <span className="text-[10px] text-muted">{shortDayLabel(d)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
