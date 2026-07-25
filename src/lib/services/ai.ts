// AI service (plan §3.2, §4, §6): Gemini-backed daily/weekly summaries,
// natural-language task creation, and the Day Planner. Every call is:
//   - user-scoped (resolveUserId),
//   - rate-limited (usage.reserveCall), and
//   - cached where it makes sense (summaries + plans in their collections),
// so repeated page views don't re-bill the model.

import { db } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import { getUserPrefs } from "./prefs";
import { listTasks } from "./tasks";
import { getLogsInRange, indexLogs } from "./logs";
import { getMood } from "./daily";
import {
  getDailyCompletion,
  getMoodSeries,
  getCategoryBreakdown,
} from "./analytics";
import { taskAppliesOn } from "@/lib/recurrence";
import { logKey } from "@/lib/keys";
import { todayKey, lastNDays, shortDayLabel, type DayKey } from "@/lib/date";
import { aiConfigured, generateJson, AiError } from "@/lib/ai/gemini";
import { reserveCall, getUsage, type UsageStatus } from "@/lib/ai/usage";
import type { AiInsight, DailyPlan, Task, TaskLog } from "@/lib/types";
import { taskInputSchema, type TaskInput } from "@/lib/schemas";

export { aiConfigured, AiError };

export interface AiStatus {
  configured: boolean;
  usage: UsageStatus | null;
}

export async function aiStatus(userId?: string): Promise<AiStatus> {
  if (!aiConfigured) return { configured: false, usage: null };
  userId ??= await resolveUserId();
  return { configured: true, usage: await getUsage(userId) };
}

// ---- Tone ----

const TONE_GUIDE: Record<string, string> = {
  encouraging:
    "Warm, supportive coach. Celebrate wins, frame misses gently as opportunities.",
  neutral: "Calm and factual. Objective, no fluff, no exclamation marks.",
  blunt: "Direct and terse. Call out slippage plainly; skip pleasantries.",
};

// ---- Context builders ----

function describeLog(task: Task, log?: TaskLog): string {
  if (!log) return "not logged";
  const v = log.value;
  if (v.kind === "boolean") return v.boolStatus ? "done" : "not done";
  if (v.kind === "quantity") {
    return `${v.actualValue ?? 0}${v.unitSnapshot ? " " + v.unitSnapshot : ""} of ${
      v.targetValueSnapshot ?? "?"
    } (${v.percentage ?? 0}%)`;
  }
  return `${v.percentage ?? 0}%`;
}

async function dailyContext(userId: string, date: DayKey): Promise<string> {
  const tasks = await listTasks(userId);
  const logs = await getLogsInRange(date, date, userId);
  const idx = indexLogs(logs);
  const applicable = tasks.filter((t) => taskAppliesOn(t, date));

  const taskLines = applicable.length
    ? applicable
        .map((t) => `- ${t.title}: ${describeLog(t, idx.get(logKey(t._id, date)))}`)
        .join("\n")
    : "- (no tasks scheduled today)";

  const mood = await getMood(date, userId);

  // Journals are end-to-end encrypted — the server can't read them, so they're
  // deliberately never part of the AI context.
  const parts = [`Date: ${date}`, `Today's tasks:\n${taskLines}`];
  if (mood) parts.push(`Mood: ${mood.mood}/5${mood.note ? ` — "${mood.note}"` : ""}`);
  return parts.join("\n\n");
}

async function weeklyContext(userId: string): Promise<string> {
  const days = 7;
  const dates = lastNDays(days);
  const [completion, moods, categories, tasks, logs] = await Promise.all([
    getDailyCompletion(days, userId),
    getMoodSeries(days, userId),
    getCategoryBreakdown(days, userId),
    listTasks(userId),
    getLogsInRange(dates[0], dates[dates.length - 1], userId),
  ]);
  const idx = indexLogs(logs);

  const moodByDate = new Map(moods.map((m) => [m.date, m.mood]));
  const rows = completion
    .map((c) => {
      const mood = moodByDate.get(c.date);
      const rate = c.applicable ? `${Math.round(c.rate * 100)}%` : "no tasks";
      return `- ${shortDayLabel(c.date)}: completion ${rate}${
        mood ? `, mood ${mood}/5` : ""
      }`;
    })
    .join("\n");

  // Per-task weekly rollup so the summary can name specifics (how often each
  // habit was hit, and the average for measurable ones).
  const taskLines = tasks
    .map((t) => {
      const applicableDays = dates.filter((d) => taskAppliesOn(t, d));
      if (applicableDays.length === 0) return null;
      if (t.type === "boolean") {
        const done = applicableDays.filter(
          (d) => idx.get(logKey(t._id, d))?.value.boolStatus,
        ).length;
        return `- ${t.title}: ${done}/${applicableDays.length} days`;
      }
      const pcts = applicableDays.map(
        (d) => idx.get(logKey(t._id, d))?.value.percentage ?? 0,
      );
      const avg = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
      const logged = pcts.filter((p) => p > 0).length;
      return `- ${t.title}: avg ${avg}% over ${applicableDays.length} scheduled days (${logged} logged)`;
    })
    .filter(Boolean)
    .join("\n");

  const catLine = categories
    .slice(0, 5)
    .map((c) => `${c.category} (${c.count})`)
    .join(", ");

  return [
    "Last 7 days:",
    rows,
    taskLines ? `Per-task this week:\n${taskLines}` : "",
    catLine ? `Most active categories: ${catLine}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---- Summaries ----

export async function generateSummary(
  type: "daily" | "weekly",
  opts: { force?: boolean } = {},
  userId?: string,
): Promise<AiInsight> {
  userId ??= await resolveUserId();
  const date = todayKey();
  const id = `${userId}|${type}|${date}`;

  if (!opts.force) {
    const cached = await db.aiInsights.findById(id);
    if (cached) return cached;
  }

  const prefs = await getUserPrefs(userId);
  const tone = TONE_GUIDE[prefs.ai.tone] ?? TONE_GUIDE.encouraging;
  const context =
    type === "daily"
      ? await dailyContext(userId, date)
      : await weeklyContext(userId);

  const period = type === "daily" ? "day" : "week";
  const system =
    `You are a personal productivity coach embedded in a daily task tracker. ` +
    `${tone} Base everything ONLY on the data provided — never invent tasks, numbers, or events. ` +
    `Write a detailed ${type} reflection of two short paragraphs (roughly 5–8 sentences total). ` +
    `Open with how the ${period} went overall, then get specific: name the tasks that were completed ` +
    `or missed, cite the actual quantities and percentages, call out streaks or trends, and connect to ` +
    `mood or journal notes when they're present. Then give 3–5 specific, actionable recommendations — ` +
    `each a full sentence that says what to do next and why it helps.`;

  const prompt =
    `Write a ${type} reflection for the user based on this data:\n\n${context}\n\n` +
    `Respond as JSON with "summary" (a detailed multi-sentence string in plain prose — no markdown ` +
    `headings or bullet points) and "recommendations" (an array of 3–5 specific action strings).`;

  await reserveCall(userId, `summary:${type}`);

  const result = await generateJson<{
    summary: string;
    recommendations: string[];
  }>(prompt, {
    system,
    temperature: 0.6,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        recommendations: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "recommendations"],
    },
  });

  const insight: AiInsight = {
    _id: id,
    userId,
    type,
    date,
    summary: result.summary.trim(),
    recommendations: (result.recommendations ?? []).slice(0, 6),
  };

  await db.aiInsights.upsert((c) => c._id === id, () => insight, insight, {
    _id: id,
  });
  return insight;
}

/** Cached insight without generating (for first paint). */
export async function getCachedSummary(
  type: "daily" | "weekly",
  userId?: string,
): Promise<AiInsight | null> {
  userId ??= await resolveUserId();
  return db.aiInsights.findById(`${userId}|${type}|${todayKey()}`);
}

// ---- Natural-language task creation (plan §3.2) ----

interface RawTaskDraft {
  title: string;
  description?: string;
  taskType?: string;
  goal?: string;
  percentageMode?: string;
  unit?: string;
  targetValue?: number;
  recurrence?: string;
  recurrenceDays?: number[];
  priority?: string;
  category?: string;
  estimatedDuration?: number;
  reminderTime?: string;
  reminderDays?: number[];
}

export async function parseTaskDraft(
  text: string,
  userId?: string,
): Promise<TaskInput> {
  userId ??= await resolveUserId();
  if (!text.trim()) throw new AiError("Describe the task first.", 400);

  const system =
    `You extract a rich, structured task from the user's phrase for a habit/task tracker. ` +
    `Fill in EVERY field you can reasonably infer — the goal is a task the user rarely has to edit.\n` +
    `- title: a short, clean imperative label (e.g. "Drink 3 L of water"). Strip filler words.\n` +
    `- description: ALWAYS write one concise, motivating sentence explaining the task and why it helps, ` +
    `even if the user didn't give one. Do not just repeat the title.\n` +
    `- goal: "avoid" when the user wants to quit, stop, cut down, or abstain from something ` +
    `("quit smoking", "no doomscrolling", "stop biting nails"); otherwise "build". Avoid tasks are always "boolean".\n` +
    `- taskType: "boolean" for a simple yes/no habit; "percentage" with percentageMode "quantity" when there's a ` +
    `measurable target with a natural unit ("drink 3 L water" → unit "L", targetValue 3; "read 30 pages" → unit "pages", targetValue 30); ` +
    `use percentageMode "direct" for progress toward something with no natural countable unit.\n` +
    `- category: infer a sensible single-word category (Health, Fitness, Learning, Work, Finance, Mindfulness, ` +
    `Chores, Social, Creativity, Sleep, etc.). Reuse the user's wording if they name one.\n` +
    `- priority: "high" for health/deadline/important framing, "low" for nice-to-haves, else "medium".\n` +
    `- recurrence: "daily", "weekdays", "custom", or "one-off". For "custom" fill recurrenceDays (0=Sun..6=Sat) ` +
    `matching phrases like "every Mon and Thu". A dated one-time thing is "one-off".\n` +
    `- estimatedDuration: for "build" tasks, estimate how long one session takes, IN MINUTES ` +
    `(convert any unit: "1 hour" → 60, "1.5h" → 90, "45 min" → 45); give a realistic guess even if unstated. ` +
    `OMIT it entirely for "avoid" tasks (abstaining has no session length).\n` +
    `- reminderTime: HH:mm 24h. Set it if the user names a time, OR map natural phrases ` +
    `("morning" → 08:00, "after work"/"evening" → 18:00, "before bed"/"night" → 21:00, "noon" → 12:00, "afternoon" → 15:00). ` +
    `Leave it out only when there's no timing cue at all.\n` +
    `- reminderDays: if a reminder is set, the weekday numbers it should fire on (mirror recurrence; empty means every applicable day).`;

  await reserveCall(userId, "parse-task");

  const raw = await generateJson<RawTaskDraft>(
    `Phrase: "${text.trim()}"\nToday is ${todayKey()}. Return JSON, filling in every field you can infer.`,
    {
      system,
      temperature: 0.3,
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          taskType: { type: "string", enum: ["boolean", "percentage"] },
          goal: { type: "string", enum: ["build", "avoid"] },
          percentageMode: { type: "string", enum: ["quantity", "direct"] },
          unit: { type: "string" },
          targetValue: { type: "number" },
          recurrence: {
            type: "string",
            enum: ["daily", "weekdays", "custom", "one-off"],
          },
          recurrenceDays: { type: "array", items: { type: "number" } },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          category: { type: "string" },
          estimatedDuration: { type: "number" },
          reminderTime: { type: "string" },
          reminderDays: { type: "array", items: { type: "number" } },
        },
        required: ["title", "description", "taskType", "recurrence", "category", "priority"],
      },
    },
  );

  // Map the model's flat draft onto the real task-input shape, then validate.
  const goal = raw.goal === "avoid" ? "avoid" : "build";
  // Avoid tasks are always yes/no, regardless of what the model guessed for type.
  const type =
    goal === "avoid"
      ? "boolean"
      : raw.taskType === "percentage"
        ? "percentage"
        : "boolean";
  const input: Record<string, unknown> = {
    title: raw.title,
    description: raw.description?.trim() || undefined,
    type,
    goal,
    recurrence: ["daily", "weekdays", "custom", "one-off"].includes(
      raw.recurrence ?? "",
    )
      ? raw.recurrence
      : "daily",
    priority: ["low", "medium", "high"].includes(raw.priority ?? "")
      ? raw.priority
      : "medium",
    category: raw.category?.trim() || undefined,
    // Avoid tasks are a daily yes/no abstention — a "session length" is meaningless.
    estimatedDuration:
      goal !== "avoid" && raw.estimatedDuration && raw.estimatedDuration > 0
        ? Math.min(1440, Math.round(raw.estimatedDuration))
        : undefined,
    active: true,
  };

  if (type === "percentage") {
    const mode = raw.percentageMode === "direct" ? "direct" : "quantity";
    input.percentageConfig =
      mode === "quantity"
        ? {
            mode,
            unit: { type: "custom", value: (raw.unit || "units").slice(0, 24) },
            targetValue: raw.targetValue && raw.targetValue > 0 ? raw.targetValue : 1,
          }
        : { mode: "direct" };
  }
  if (input.recurrence === "custom") {
    input.recurrenceDays = (raw.recurrenceDays ?? []).filter(
      (d) => d >= 0 && d <= 6,
    );
  }
  if (raw.reminderTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.reminderTime)) {
    const days = (raw.reminderDays ?? []).filter((d) => d >= 0 && d <= 6);
    input.reminder = { time: raw.reminderTime, days };
  }

  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AiError(
      "Couldn't turn that into a valid task — try rephrasing with a clear goal.",
      422,
    );
  }
  return parsed.data;
}

// ---- Day Planner (plan §3.5) ----

export async function generateDayPlan(
  date: DayKey,
  items: { description: string; estimatedDuration?: number }[],
  userId?: string,
): Promise<DailyPlan> {
  userId ??= await resolveUserId();
  const prefs = await getUserPrefs(userId);
  const tasks = await listTasks(userId);
  const applicable = tasks.filter((t) => taskAppliesOn(t, date));

  const taskList = applicable.length
    ? applicable
        .map(
          (t) =>
            `- ${t.title}${
              t.estimatedDuration ? ` (~${t.estimatedDuration} min)` : ""
            }${t.priority !== "medium" ? ` [${t.priority} priority]` : ""}`,
        )
        .join("\n")
    : "- (no recurring tasks scheduled)";

  const extraList = items.length
    ? items
        .map(
          (i) =>
            `- ${i.description}${
              i.estimatedDuration ? ` (~${i.estimatedDuration} min)` : ""
            }`,
        )
        .join("\n")
    : "- (none)";

  const system =
    `You are a scheduling assistant. Produce a realistic time-blocked plan for one day ` +
    `within the user's waking hours. Order by priority and energy, include short breaks, ` +
    `and don't overfill the day. Use 24h "HH:mm" times. Keep notes brief.`;

  const prompt =
    `Waking hours: ${prefs.workingHours.wake}–${prefs.workingHours.sleep}. Date: ${date}.\n\n` +
    `Recurring tasks for today:\n${taskList}\n\n` +
    `One-off requirements:\n${extraList}\n\n` +
    `Return JSON with "blocks": an array of { start, end, item, note? }.`;

  await reserveCall(userId, "day-plan");

  const result = await generateJson<{
    blocks: { start: string; end: string; item: string; note?: string }[];
  }>(prompt, {
    system,
    temperature: 0.4,
    schema: {
      type: "object",
      properties: {
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start: { type: "string" },
              end: { type: "string" },
              item: { type: "string" },
              note: { type: "string" },
            },
            required: ["start", "end", "item"],
          },
        },
      },
      required: ["blocks"],
    },
  });

  const plan: DailyPlan = {
    _id: `${userId}|${date}`,
    userId,
    date,
    blocks: (result.blocks ?? []).map((b) => ({
      start: b.start,
      end: b.end,
      item: b.item,
      note: b.note,
    })),
    generatedAt: new Date().toISOString(),
  };

  await db.dailyPlans.upsert((c) => c._id === plan._id, () => plan, plan, {
    _id: plan._id,
  });
  return plan;
}

export async function getCachedPlan(
  date: DayKey,
  userId?: string,
): Promise<DailyPlan | null> {
  userId ??= await resolveUserId();
  return db.dailyPlans.findById(`${userId}|${date}`);
}
