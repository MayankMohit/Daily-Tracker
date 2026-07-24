// Pure key helpers, safe to import from client components (no data-store deps).

import type { DayKey } from "./date";

/** Stable map key for a (task, date) log cell. */
export function logKey(taskId: string, date: DayKey): string {
  return `${taskId}|${date}`;
}
