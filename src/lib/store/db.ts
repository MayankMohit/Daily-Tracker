// Repository layer: typed collection accessors + higher-level domain helpers.
// Everything above this file (API routes, server code) talks to `db`, never to
// the underlying store, so the storage backend can be swapped without churn.

import { nanoid } from "nanoid";
import { collection } from "./index";
import { CURRENT_USER_ID, DEFAULT_TIMEZONE } from "@/lib/config";
import type {
  Task,
  TaskLog,
  MoodLog,
  JournalEntry,
  ExtraActivity,
  DailyPlanRequest,
  DailyPlan,
  AiInsight,
  ReminderDoc,
  PushSubscriptionDoc,
  AiUsageCounter,
  UserPrefs,
} from "@/lib/types";

export function newId(): string {
  return nanoid(16);
}

export const db = {
  tasks: collection<Task>("tasks"),
  taskLogs: collection<TaskLog>("taskLogs"),
  moodLogs: collection<MoodLog>("moodLogs"),
  journalEntries: collection<JournalEntry>("journalEntries"),
  extraActivities: collection<ExtraActivity>("extraActivities"),
  dailyPlanRequests: collection<DailyPlanRequest>("dailyPlanRequests"),
  dailyPlans: collection<DailyPlan>("dailyPlans"),
  aiInsights: collection<AiInsight>("aiInsights"),
  reminders: collection<ReminderDoc>("reminders"),
  pushSubscriptions: collection<PushSubscriptionDoc>("pushSubscriptions"),
  aiUsageCounters: collection<AiUsageCounter>("aiUsageCounters"),
  userPrefs: collection<UserPrefs>("userPrefs"),
};

/** Default preferences used when a user has never saved settings. */
export function defaultUserPrefs(userId = CURRENT_USER_ID): UserPrefs {
  return {
    _id: userId,
    userId,
    theme: "system",
    timezone: DEFAULT_TIMEZONE,
    workingHours: { wake: "07:00", sleep: "23:00" },
    ai: {
      frequency: "daily",
      tone: "encouraging",
      journalInformedByDefault: false,
      moodCorrelation: true,
      extraActivityAutoTag: false,
    },
  };
}

export async function getUserPrefs(userId = CURRENT_USER_ID): Promise<UserPrefs> {
  const existing = await db.userPrefs.findById(userId);
  return existing ?? defaultUserPrefs(userId);
}
