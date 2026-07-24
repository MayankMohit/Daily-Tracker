// Pure recurrence helpers — no data-store imports, so this is safe to use in
// client components (the table) as well as server services.

import type { Task } from "./types";
import { dayOfWeek, type DayKey } from "./date";

/** Should this task appear/track on the given day, per its recurrence + date range? */
export function taskAppliesOn(task: Task, date: DayKey): boolean {
  if (task.startDate && date < task.startDate) return false;
  if (task.endDate && date > task.endDate) return false;
  switch (task.recurrence) {
    case "daily":
      return true;
    case "weekdays": {
      const d = dayOfWeek(date);
      return d >= 1 && d <= 5;
    }
    case "custom":
      return (task.recurrenceDays ?? []).includes(dayOfWeek(date));
    case "one-off":
      return task.startDate ? date === task.startDate : true;
  }
}
