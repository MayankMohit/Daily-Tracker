"use client";

// Boolean-task history (plan §3). A line chart is meaningless for a yes/no habit
// — 0 and 100 zig-zagging tells you nothing — so we show a calendar grid: one
// dated cell per day, aligned to weekday columns and filled by outcome. Done
// cells take the task colour (with auto-contrasting text); missed cells are
// clearly red; off-days are faint. Headline stats (rate, current + best streak)
// sit above.

import type { TaskSeries } from "@/lib/services/analytics";
import { taskAppliesOn } from "@/lib/recurrence";
import { dayNumberLabel, dayOfWeek, monthDayLabel, toDayKey } from "@/lib/date";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Pick black or white text for a hex background so the day number stays legible
// on any task colour (e.g. white on yellow is unreadable).
function readableText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

export function HabitChart({ series }: { series: TaskSeries }) {
  const avoid = series.task.goal === "avoid";
  // Custom-coloured tasks fill their "done" cells with that hue (auto-contrasting
  // text). Colourless tasks fall back to a solid foreground swatch — theme-aware
  // and always legible — rather than the accent, which is near-white in dark mode
  // and would render invisible white-on-white numbers.
  const color = series.task.color ?? undefined;
  const doneText = color ? readableText(color) : undefined;

  // The task didn't exist before it was created, so earlier days can't be
  // "missed" — they're greyed like off-days. Compare on the local day the task
  // was created (createdAt is a UTC timestamp).
  const createdDay = toDayKey(new Date(series.task.createdAt));

  const cells = series.points.map((p) => {
    const existed = p.date >= createdDay;
    return {
      date: p.date,
      existed,
      applicable: existed && taskAppliesOn(series.task, p.date),
      // Boolean logs store 100 when done; a missing entry means "not done".
      done: (p.percentage ?? 0) >= 100,
      day: dayNumberLabel(p.date),
      dow: dayOfWeek(p.date),
      newMonth: p.date.slice(8, 10) === "01",
    };
  });

  const first = series.points[0]?.date;
  const last = series.points[series.points.length - 1]?.date;
  const leadPad = cells.length ? cells[0].dow : 0;

  const scheduled = cells.filter((d) => d.applicable);
  const doneCount = scheduled.filter((d) => d.done).length;
  const rate = scheduled.length
    ? Math.round((doneCount / scheduled.length) * 100)
    : 0;

  // Best run of successes, and the current run counting back from the last
  // scheduled day — both over scheduled days only (skipped days don't break it).
  let best = 0;
  let run = 0;
  for (const d of scheduled) {
    if (d.done) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = scheduled.length - 1; i >= 0; i--) {
    if (scheduled[i].done) current++;
    else break;
  }

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-6">
          <Stat value={`${rate}%`} label={avoid ? "stayed clean" : "completion"} />
          <Stat value={String(current)} label="current streak" />
          <Stat value={String(best)} label="best streak" />
        </div>
        {first && last && (
          <div className="text-[11px] text-muted">
            {monthDayLabel(first)} – {monthDayLabel(last)}
          </div>
        )}
      </div>

      {/* Weekday header */}
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted">
            {w}
          </div>
        ))}
      </div>

      {/* Calendar cells — columns stretch to fill the width evenly. */}
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadPad }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map((d) => {
          const title = !d.existed
            ? `${monthDayLabel(d.date)}: before task was created`
            : !d.applicable
              ? `${monthDayLabel(d.date)}: not scheduled`
              : `${monthDayLabel(d.date)}: ${
                d.done
                  ? avoid
                    ? "stayed clean"
                    : "done"
                  : avoid
                    ? "slipped"
                    : "missed"
              }`;
          return (
            <div
              key={d.date}
              title={title}
              className={cn(
                "flex h-9 items-center justify-center rounded-md text-xs tabular-nums",
                !d.applicable && "bg-surface-2/40 text-muted/50",
                d.applicable &&
                  !d.done &&
                  "border border-danger/40 bg-danger/15 text-danger",
                d.applicable && d.done && "font-semibold",
                d.applicable && d.done && !color && "bg-foreground text-background",
                d.newMonth && "ring-1 ring-inset ring-foreground/30",
              )}
              style={
                d.applicable && d.done && color
                  ? { backgroundColor: color, color: doneText }
                  : undefined
              }
            >
              {d.day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className={cn("h-3 w-3 rounded-[3px]", !color && "bg-foreground")}
            style={color ? { backgroundColor: color } : undefined}
          />
          {avoid ? "stayed clean" : "done"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] border border-danger/40 bg-danger/15" />
          {avoid ? "slipped" : "missed"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-surface-2/40" />
          off day
        </span>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums leading-none">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted">{label}</div>
    </div>
  );
}
