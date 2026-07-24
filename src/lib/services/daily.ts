// Mood, journal, and extra-activity logic (plan §3.3, §3.4, §6). All keyed by
// (userId, date); mood and journal are one-per-day upserts, extra activities are
// a running list.

import { db, newId, getUserPrefs } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { MoodLog, JournalEntry, ExtraActivity } from "@/lib/types";
import type { DayKey } from "@/lib/date";
import type {
  MoodInput,
  JournalInput,
  ExtraActivityInput,
} from "@/lib/schemas";

// ---- Mood ----

export async function setMood(
  input: MoodInput,
  userId?: string,
): Promise<MoodLog> {
  userId ??= await resolveUserId();
  const match = (m: MoodLog) => m.userId === userId && m.date === input.date;
  return db.moodLogs.upsert(
    match,
    () => ({ _id: newId(), userId, date: input.date, mood: input.mood }),
    { mood: input.mood, note: input.note?.trim() || undefined },
  );
}

export async function getMood(
  date: DayKey,
  userId?: string,
): Promise<MoodLog | null> {
  userId ??= await resolveUserId();
  return db.moodLogs.findOne((m) => m.userId === userId && m.date === date);
}

export async function getMoodsInRange(
  from: DayKey,
  to: DayKey,
  userId?: string,
): Promise<MoodLog[]> {
  userId ??= await resolveUserId();
  const rows = await db.moodLogs.find(
    (m) => m.userId === userId && m.date >= from && m.date <= to,
  );
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Journal ----

export async function setJournal(
  input: JournalInput,
  userId?: string,
): Promise<JournalEntry> {
  userId ??= await resolveUserId();
  const match = (j: JournalEntry) =>
    j.userId === userId && j.date === input.date;
  const now = new Date().toISOString();
  return db.journalEntries.upsert(
    match,
    () => ({
      _id: newId(),
      userId,
      date: input.date,
      text: input.text,
      allowAiRead: input.allowAiRead,
      updatedAt: now,
    }),
    { text: input.text, allowAiRead: input.allowAiRead, updatedAt: now },
  );
}

export async function getJournal(
  date: DayKey,
  userId?: string,
): Promise<JournalEntry | null> {
  userId ??= await resolveUserId();
  return db.journalEntries.findOne(
    (j) => j.userId === userId && j.date === date,
  );
}

/** The global default AI-read preference for new journal entries (plan §3.3). */
export async function journalAiDefault(
  userId?: string,
): Promise<boolean> {
  userId ??= await resolveUserId();
  const prefs = await getUserPrefs(userId);
  return prefs.ai.journalInformedByDefault;
}

// ---- Extra activities ----

export async function addExtraActivity(
  input: ExtraActivityInput,
  userId?: string,
): Promise<ExtraActivity> {
  userId ??= await resolveUserId();
  const activity: ExtraActivity = {
    _id: newId(),
    userId,
    date: input.date,
    description: input.description.trim(),
    estimatedDuration: input.estimatedDuration,
    category: input.category?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  return db.extraActivities.insert(activity);
}

export async function getExtraActivities(
  date: DayKey,
  userId?: string,
): Promise<ExtraActivity[]> {
  userId ??= await resolveUserId();
  const rows = await db.extraActivities.find(
    (e) => e.userId === userId && e.date === date,
  );
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** All extra activities in a date range — powers the dashboard chart's per-day
 *  hover, so past days can surface what else you did (the table only ever shows
 *  today's). Sorted by date then creation time. */
export async function getExtraActivitiesInRange(
  from: DayKey,
  to: DayKey,
  userId?: string,
): Promise<ExtraActivity[]> {
  userId ??= await resolveUserId();
  const rows = await db.extraActivities.find(
    (e) => e.userId === userId && e.date >= from && e.date <= to,
  );
  return rows.sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
}

export async function deleteExtraActivity(
  id: string,
  userId?: string,
): Promise<boolean> {
  userId ??= await resolveUserId();
  const existing = await db.extraActivities.findById(id);
  if (!existing || existing.userId !== userId) return false;
  return db.extraActivities.remove(id);
}
