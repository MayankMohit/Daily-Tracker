// Monthly rollup heatmap (plan §3, §6): a GitHub-style grid of daily completion
// rate. No interactivity beyond hover titles, so it renders on the server.

import type { DailyCompletion } from "@/lib/services/analytics";
import { dayOfWeek, monthDayLabel } from "@/lib/date";
import { cn } from "@/lib/cn";

const WEEKDAY_ROWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cellColor(rate: number, hasTasks: boolean): string {
  if (!hasTasks) return "bg-surface-2";
  if (rate <= 0) return "bg-surface-2";
  if (rate < 0.25) return "bg-accent/20";
  if (rate < 0.5) return "bg-accent/40";
  if (rate < 0.75) return "bg-accent/60";
  if (rate < 1) return "bg-accent/80";
  return "bg-accent";
}

export function CompletionHeatmap({ data }: { data: DailyCompletion[] }) {
  // Group into week columns (Sun–Sat). Pad the first week so weekdays align.
  const columns: (DailyCompletion | null)[][] = [];
  let current: (DailyCompletion | null)[] = [];

  data.forEach((d, i) => {
    if (i === 0) {
      for (let p = 0; p < dayOfWeek(d.date); p++) current.push(null);
    }
    current.push(d);
    if (dayOfWeek(d.date) === 6) {
      columns.push(current);
      current = [];
    }
  });
  if (current.length) {
    while (current.length < 7) current.push(null);
    columns.push(current);
  }

  return (
    <div className="flex gap-2">
      <div className="flex flex-col gap-1 pt-0.5 text-[10px] text-muted">
        {WEEKDAY_ROWS.map((w, i) => (
          <span key={w} className="h-3.5 leading-3.5">
            {i % 2 === 1 ? w : ""}
          </span>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {columns.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((cell, di) => (
              <div
                key={di}
                title={
                  cell
                    ? `${monthDayLabel(cell.date)}: ${Math.round(
                        cell.rate * 100,
                      )}% of ${cell.applicable} task${cell.applicable === 1 ? "" : "s"}`
                    : undefined
                }
                className={cn(
                  "h-3.5 w-3.5 rounded-sm",
                  cell ? cellColor(cell.rate, cell.applicable > 0) : "opacity-0",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
