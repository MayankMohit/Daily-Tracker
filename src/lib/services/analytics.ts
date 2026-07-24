// Aggregations for the Insights page (plan §3, §6): per-task progress series,
// mood series, daily completion rate (for the rollup heatmap and the future
// mood-productivity correlation), and time-by-category.

import { resolveUserId } from "@/lib/auth";
import type { Task, TaskLog } from "@/lib/types";
import { listTasks } from "./tasks";
import { getLogsInRange, getLogsForTask } from "./logs";
import { getMoodsInRange } from "./daily";
import { db } from "@/lib/store/db";
import { taskAppliesOn } from "@/lib/recurrence";
import { indexLogs } from "./logs";
import { logKey } from "@/lib/keys";
import { lastNDays, type DayKey } from "@/lib/date";

export interface TaskSeriesPoint {
  date: DayKey;
  /** Capped 0-100 (for the progress line). undefined = no entry that day. */
  percentage?: number;
  /** Uncapped (quantity overachievement). */
  raw?: number;
  /** Raw quantity, for the tooltip. */
  actual?: number;
}

export interface TaskSeries {
  task: Task;
  points: TaskSeriesPoint[];
  unit?: string;
}

/** A per-task series over the last N days, aligned to a continuous date axis. */
export async function getTaskSeries(
  taskId: string,
  days = 30,
  userId?: string,
): Promise<TaskSeries | null> {
  userId ??= await resolveUserId();
  const task = await db.tasks.findById(taskId);
  if (!task || task.userId !== userId) return null;
  const logs = await getLogsForTask(taskId, userId);
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const dates = lastNDays(days);

  const points: TaskSeriesPoint[] = dates.map((date) => {
    const log = byDate.get(date);
    if (!log) return { date };
    return pointFromLog(date, log);
  });

  const unit =
    task.type === "percentage" && task.percentageConfig?.mode === "quantity"
      ? task.percentageConfig.unit?.value
      : undefined;

  return { task, points, unit };
}

function pointFromLog(date: DayKey, log: TaskLog): TaskSeriesPoint {
  const v = log.value;
  if (v.kind === "boolean") {
    return { date, percentage: v.boolStatus ? 100 : 0 };
  }
  return {
    date,
    percentage: v.percentage,
    raw: v.rawPercentage ?? v.percentage,
    actual: v.actualValue,
  };
}

export interface MoodPoint {
  date: DayKey;
  mood?: number;
}

export async function getMoodSeries(
  days = 30,
  userId?: string,
): Promise<MoodPoint[]> {
  userId ??= await resolveUserId();
  const dates = lastNDays(days);
  const moods = await getMoodsInRange(dates[0], dates[dates.length - 1], userId);
  const byDate = new Map(moods.map((m) => [m.date, m.mood]));
  return dates.map((date) => ({ date, mood: byDate.get(date) }));
}

export interface DailyCompletion {
  date: DayKey;
  /** 0-1 average completion across the tasks that applied that day. */
  rate: number;
  applicable: number;
}

/**
 * Daily completion rate: for each day, average each applicable task's
 * contribution (boolean = 0/1, percentage = capped%/100). Powers the rollup
 * heatmap and, later, the mood-productivity correlation.
 */
export async function getDailyCompletion(
  days = 30,
  userId?: string,
): Promise<DailyCompletion[]> {
  userId ??= await resolveUserId();
  const dates = lastNDays(days);
  const tasks = await listTasks(userId, { includeArchived: true });
  const logs = await getLogsInRange(dates[0], dates[dates.length - 1], userId);
  const idx = indexLogs(logs);

  return dates.map((date) => {
    const applicable = tasks.filter((t) => taskAppliesOn(t, date));
    if (applicable.length === 0) return { date, rate: 0, applicable: 0 };
    let sum = 0;
    for (const t of applicable) {
      const log = idx.get(logKey(t._id, date));
      sum += contribution(log);
    }
    return { date, rate: sum / applicable.length, applicable: applicable.length };
  });
}

function contribution(log?: TaskLog): number {
  if (!log) return 0;
  const v = log.value;
  if (v.kind === "boolean") return v.boolStatus ? 1 : 0;
  return Math.min(100, v.percentage ?? 0) / 100;
}

export interface MoodProductivity {
  lowMoodRate: number | null; // avg completion on mood ≤ 2 days
  highMoodRate: number | null; // avg completion on mood ≥ 4 days
  lowDays: number;
  highDays: number;
  /** Pearson correlation between mood and completion over paired days, or null. */
  correlation: number | null;
  pairedDays: number;
}

/**
 * Basic mood–productivity correlation (plan §3, §6) computed statistically — no
 * AI call. Later, the AI insight can phrase this ("completion drops ~X% on
 * low-mood days"); the number itself is cheap to derive here.
 */
export async function getMoodProductivity(
  days = 30,
  userId?: string,
): Promise<MoodProductivity> {
  userId ??= await resolveUserId();
  const [completion, moods] = await Promise.all([
    getDailyCompletion(days, userId),
    getMoodSeries(days, userId),
  ]);
  const moodByDate = new Map(moods.map((m) => [m.date, m.mood]));

  const pairs: { mood: number; rate: number }[] = [];
  for (const c of completion) {
    const mood = moodByDate.get(c.date);
    // Only count days that had tasks and a logged mood.
    if (mood === undefined || c.applicable === 0) continue;
    pairs.push({ mood, rate: c.rate });
  }

  const low = pairs.filter((p) => p.mood <= 2);
  const high = pairs.filter((p) => p.mood >= 4);
  const avg = (xs: { rate: number }[]) =>
    xs.length ? xs.reduce((s, x) => s + x.rate, 0) / xs.length : null;

  return {
    lowMoodRate: avg(low),
    highMoodRate: avg(high),
    lowDays: low.length,
    highDays: high.length,
    correlation: pearson(pairs.map((p) => p.mood), pairs.map((p) => p.rate)),
    pairedDays: pairs.length,
  };
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export interface CategoryTime {
  category: string;
  minutes: number;
  count: number;
}

/**
 * Time/activity by category, blending tracked tasks' estimated durations (on days
 * they were completed) with ad-hoc extra activities (plan §3.4).
 */
export async function getCategoryBreakdown(
  days = 30,
  userId?: string,
): Promise<CategoryTime[]> {
  userId ??= await resolveUserId();
  const dates = lastNDays(days);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const tasks = await listTasks(userId, { includeArchived: true });
  const taskById = new Map(tasks.map((t) => [t._id, t]));
  const logs = await getLogsInRange(from, to, userId);
  const extras = await db.extraActivities.find(
    (e) => e.userId === userId && e.date >= from && e.date <= to,
  );

  const totals = new Map<string, CategoryTime>();
  const bump = (category: string, minutes: number) => {
    const key = category || "Uncategorized";
    const cur = totals.get(key) ?? { category: key, minutes: 0, count: 0 };
    cur.minutes += minutes;
    cur.count += 1;
    totals.set(key, cur);
  };

  for (const log of logs) {
    const task = taskById.get(log.taskId);
    if (!task) continue;
    if (contribution(log) <= 0) continue;
    bump(task.category ?? "", task.estimatedDuration ?? 0);
  }
  for (const e of extras) {
    bump(e.category ?? "", e.estimatedDuration ?? 0);
  }

  return Array.from(totals.values()).sort((a, b) => b.count - a.count);
}
