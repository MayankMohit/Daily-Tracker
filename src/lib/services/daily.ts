// Mood, journal, and extra-activity logic (plan §3.3, §3.4, §6). All keyed by
// (userId, date); mood and journal are one-per-day upserts, extra activities are
// a running list.

import { db, newId } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type {
  MoodLog,
  JournalEntry,
  JournalKeyDoc,
  ExtraActivity,
} from "@/lib/types";
import type { DayKey } from "@/lib/date";
import type {
  MoodInput,
  JournalInput,
  JournalKeySetup,
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
      cipher: input.cipher,
      iv: input.iv,
      updatedAt: now,
    }),
    // Overwrite any legacy plaintext with the ciphertext so no readable copy
    // lingers server-side once an entry has been encrypted.
    { cipher: input.cipher, iv: input.iv, text: "", updatedAt: now },
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

// ---- Journal encryption key params (non-secret) ----

export async function getJournalKey(
  userId?: string,
): Promise<JournalKeyDoc | null> {
  userId ??= await resolveUserId();
  return db.journalKeys.findById(userId);
}

/** First-time setup of the journal key envelope. Refuses to overwrite a valid
 *  existing one (use {@link rekeyJournalKey} to change the passphrase), but will
 *  replace a malformed/legacy doc that lacks a usable envelope — otherwise such
 *  a doc would leave the user permanently unable to set up or unlock. */
export async function setJournalKey(
  input: JournalKeySetup,
  userId?: string,
): Promise<JournalKeyDoc> {
  userId ??= await resolveUserId();
  const existing = await db.journalKeys.findById(userId);
  if (existing && existing.wrappedDek && existing.wrappedDekIv) {
    throw new Error("Journal passphrase is already set");
  }
  const now = new Date().toISOString();
  if (existing) {
    const updated = await db.journalKeys.update(userId, {
      salt: input.salt,
      wrappedDek: input.wrappedDek,
      wrappedDekIv: input.wrappedDekIv,
      updatedAt: now,
    });
    if (!updated) throw new Error("Could not set up journal encryption");
    return updated;
  }
  const doc: JournalKeyDoc = {
    _id: userId,
    userId,
    salt: input.salt,
    wrappedDek: input.wrappedDek,
    wrappedDekIv: input.wrappedDekIv,
    createdAt: now,
  };
  return db.journalKeys.insert(doc);
}

/** Change passphrase: store the DEK re-wrapped under the new passphrase. Entries
 *  are untouched (they're keyed by the DEK, which is unchanged). Requires an
 *  existing envelope; the caller proves the old passphrase client-side by
 *  unwrapping the DEK before producing the new wrap. */
export async function rekeyJournalKey(
  input: JournalKeySetup,
  userId?: string,
): Promise<JournalKeyDoc> {
  userId ??= await resolveUserId();
  const existing = await db.journalKeys.findById(userId);
  if (!existing) throw new Error("No journal passphrase to change");
  const updated = await db.journalKeys.update(userId, {
    salt: input.salt,
    wrappedDek: input.wrappedDek,
    wrappedDekIv: input.wrappedDekIv,
    updatedAt: new Date().toISOString(),
  });
  if (!updated) throw new Error("Could not update journal passphrase");
  return updated;
}

/** Journal entries in a date range, as stored (ciphertext + IV, and any legacy
 *  plaintext). Safe to send to the owner's browser, which decrypts client-side;
 *  the server never holds the key. Sorted oldest first. */
export async function getJournalsInRange(
  from: DayKey,
  to: DayKey,
  userId?: string,
): Promise<JournalEntry[]> {
  userId ??= await resolveUserId();
  const rows = await db.journalEntries.find(
    (j) => j.userId === userId && j.date >= from && j.date <= to,
  );
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Entries still holding legacy plaintext (pre-encryption), for the client to
 *  re-encrypt on unlock. Returns plaintext only to the signed-in owner. */
export async function getLegacyJournals(
  userId?: string,
): Promise<{ date: string; text: string }[]> {
  userId ??= await resolveUserId();
  const rows = await db.journalEntries.find(
    (j) => j.userId === userId && !j.cipher && !!j.text && j.text.trim() !== "",
  );
  return rows.map((j) => ({ date: j.date, text: j.text as string }));
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
