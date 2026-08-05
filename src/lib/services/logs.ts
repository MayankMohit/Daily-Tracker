// Task-log logic — the real source of truth for the table and graphs (plan §2.1, §5).
//
// A log records one user-entered value for a (task, date). The important nuances:
//  - quantity mode stores BOTH `percentage` (capped 0-100, for progress bars) and
//    `rawPercentage` (uncapped, so overachievement survives into graphs).
//  - the target + unit are snapshotted onto the log, so changing a task's goal
//    later never silently rewrites past days.

import { db, newId } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { TaskLog, TaskLogValue, Task } from "@/lib/types";
import { getTask } from "./tasks";
import type { DayKey } from "@/lib/date";
import type { TaskLogInput } from "@/lib/schemas";
import { logKey } from "@/lib/keys";

function computeValue(task: Task, input: TaskLogInput): TaskLogValue {
  if (task.type === "boolean") {
    // An explicit ✗ is stored (boolStatus false, failed true) so it survives
    // `isEmpty`; a plain uncheck (boolStatus false, no failed) still clears.
    if (input.failed) return { kind: "boolean", boolStatus: false, failed: true };
    return { kind: "boolean", boolStatus: input.boolStatus ?? false };
  }
  const cfg = task.percentageConfig!;
  if (cfg.mode === "direct") {
    const pct = Math.max(0, Math.min(100, input.directPercentage ?? 0));
    return { kind: "direct_percentage", percentage: pct };
  }
  // quantity mode
  const actual = Math.max(0, input.actualValue ?? 0);
  const target = cfg.targetValue || 1;
  const raw = (actual / target) * 100;
  return {
    kind: "quantity",
    actualValue: actual,
    targetValueSnapshot: cfg.targetValue,
    unitSnapshot: cfg.unit?.value,
    rawPercentage: Math.round(raw * 10) / 10,
    percentage: Math.round(Math.min(100, raw) * 10) / 10,
  };
}

/** True when a value means "nothing tracked" and the log should be removed. A
 *  ✗ (failed) is a deliberate mark, so it is NOT empty even though it isn't done. */
function isEmpty(v: TaskLogValue): boolean {
  if (v.kind === "boolean") return !v.boolStatus && !v.failed;
  return (v.percentage ?? 0) === 0 && (v.actualValue ?? 0) === 0;
}

/**
 * Upsert (or clear) the log for a (task, date). Returns the resulting log, or
 * null when the value was cleared / empty.
 */
export async function logValue(
  input: TaskLogInput,
  userId?: string,
): Promise<TaskLog | null> {
  userId ??= await resolveUserId();
  const task = await getTask(input.taskId, userId);
  if (!task) throw new Error("Task not found");

  const match = (l: TaskLog) =>
    l.userId === userId && l.taskId === input.taskId && l.date === input.date;

  // Filter narrows the Mongo query to this exact cell (the predicate still runs).
  const scope = { userId, taskId: input.taskId, date: input.date };

  if (input.clear) {
    await db.taskLogs.removeWhere(match, scope);
    return null;
  }

  const value = computeValue(task, input);
  if (isEmpty(value)) {
    await db.taskLogs.removeWhere(match, scope);
    return null;
  }

  const now = new Date().toISOString();
  return db.taskLogs.upsert(
    match,
    () => ({
      _id: newId(),
      userId,
      taskId: input.taskId,
      date: input.date,
      value,
      completedAt: now,
    }),
    { value, completedAt: now },
    scope,
  );
}

export async function getLogsInRange(
  from: DayKey,
  to: DayKey,
  userId?: string,
): Promise<TaskLog[]> {
  userId ??= await resolveUserId();
  return db.taskLogs.find(
    (l) => l.userId === userId && l.date >= from && l.date <= to,
    { userId, date: { $gte: from, $lte: to } },
  );
}

export async function getLogsForTask(
  taskId: string,
  userId?: string,
): Promise<TaskLog[]> {
  userId ??= await resolveUserId();
  const logs = await db.taskLogs.find(
    (l) => l.userId === userId && l.taskId === taskId,
    { userId, taskId },
  );
  return logs.sort((a, b) => a.date.localeCompare(b.date));
}

/** Index logs by `${taskId}|${date}` for O(1) cell lookups in the table. */
export function indexLogs(logs: TaskLog[]): Map<string, TaskLog> {
  const map = new Map<string, TaskLog>();
  for (const l of logs) map.set(logKey(l.taskId, l.date), l);
  return map;
}

export { logKey };
