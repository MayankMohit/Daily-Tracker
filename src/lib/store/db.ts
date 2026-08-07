// Repository layer: typed collection accessors + higher-level domain helpers.
// Everything above this file (API routes, server code) talks to `db`, never to
// the underlying store, so the storage backend can be swapped without churn.

import { cache } from "react";
import { nanoid } from "nanoid";
import { collection } from "./index";
import { CURRENT_USER_ID } from "@/lib/config";
import { DEFAULT_LOCK_DELAY_MS } from "@/lib/pin-lock";
import { DEFAULT_PATTERN_SCALE } from "@/lib/backgrounds";
import type {
  Task,
  TaskLog,
  MoodLog,
  JournalEntry,
  JournalKeyDoc,
  ExtraActivity,
  BackgroundImage,
  DailyPlanRequest,
  DailyPlan,
  AiInsight,
  ReminderDoc,
  PushSubscriptionDoc,
  AiUsageCounter,
  UserPrefs,
  Note,
  PinLockDoc,
} from "@/lib/types";

export function newId(): string {
  return nanoid(16);
}

export const db = {
  tasks: collection<Task>("tasks"),
  taskLogs: collection<TaskLog>("taskLogs"),
  moodLogs: collection<MoodLog>("moodLogs"),
  journalEntries: collection<JournalEntry>("journalEntries"),
  journalKeys: collection<JournalKeyDoc>("journalKeys"),
  extraActivities: collection<ExtraActivity>("extraActivities"),
  backgroundImages: collection<BackgroundImage>("backgroundImages"),
  dailyPlanRequests: collection<DailyPlanRequest>("dailyPlanRequests"),
  dailyPlans: collection<DailyPlan>("dailyPlans"),
  aiInsights: collection<AiInsight>("aiInsights"),
  reminders: collection<ReminderDoc>("reminders"),
  pushSubscriptions: collection<PushSubscriptionDoc>("pushSubscriptions"),
  aiUsageCounters: collection<AiUsageCounter>("aiUsageCounters"),
  userPrefs: collection<UserPrefs>("userPrefs"),
  notes: collection<Note>("notes"),
  pinLocks: collection<PinLockDoc>("pinLocks"),
};

/** Default preferences used when a user has never saved settings. */
export function defaultUserPrefs(userId = CURRENT_USER_ID): UserPrefs {
  return {
    _id: userId,
    userId,
    theme: "system",
    dashboardRange: "month",
    appearance: {
      palette: "default",
      accent: "mono",
      corners: "rounded",
      density: "comfortable",
      font: "sans",
      fontSize: "base",
      background: {
        preset: "none",
        overlay: 0.85,
        patternScale: DEFAULT_PATTERN_SCALE,
        surfaceAlpha: 1,
      },
    },
    autoLockMs: DEFAULT_LOCK_DELAY_MS,
    // Empty = never chosen. The client auto-detects the browser zone on first
    // load and saves it (see components/timezone-sync). Until then, day-boundary
    // logic falls back to DEFAULT_TIMEZONE via `prefs.timezone || …`.
    timezone: "",
    workingHours: { wake: "07:00", sleep: "23:00" },
    ai: {
      tone: "encouraging",
    },
  };
}

// Read once per request per user — the layout and page both resolve prefs
// (via getActiveDay), and settings/planner read them again.
export const getUserPrefs = cache(
  async (userId = CURRENT_USER_ID): Promise<UserPrefs> => {
    const existing = await db.userPrefs.findById(userId);
    if (!existing) return defaultUserPrefs(userId);
    // Backfill fields added after this doc was first saved (`appearance`,
    // `autoLockMs`), so every consumer (layout, provider, settings) can rely on
    // the full shape.
    const defaults = defaultUserPrefs(userId);
    // Deep-merge appearance so fields added after this doc was saved (e.g.
    // `background.patternScale`) are always present — a shallow `?? defaults`
    // would leave the nested background short a field for older docs.
    const appearance = existing.appearance
      ? {
          ...defaults.appearance,
          ...existing.appearance,
          background: {
            ...defaults.appearance.background,
            ...existing.appearance.background,
          },
        }
      : defaults.appearance;
    return {
      ...existing,
      appearance,
      autoLockMs: existing.autoLockMs ?? defaults.autoLockMs,
      dashboardRange: existing.dashboardRange ?? defaults.dashboardRange,
    };
  },
);
