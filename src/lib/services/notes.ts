// Notes domain logic — free-form notes, either standalone or attached to a task.
// Mirrors the extra-activities CRUD shape (see services/daily.ts): every function
// defaults `userId` via resolveUserId() and passes a Mongo filter alongside the
// JS predicate so the store stays index-friendly (see store-query-perf note).

import { db, newId } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { Note } from "@/lib/types";
import type { NoteInput } from "@/lib/schemas";

function clean(s?: string): string | undefined {
  return s && s.trim() ? s.trim() : undefined;
}

/**
 * List a user's notes. With no `taskId`, returns standalone notes (the /notes
 * page). With a `taskId`, returns that task's attached notes. Newest first.
 */
export async function listNotes(
  { taskId }: { taskId?: string } = {},
  userId?: string,
): Promise<Note[]> {
  userId ??= await resolveUserId();
  const rows = await db.notes.find(
    (n) =>
      n.userId === userId &&
      (taskId ? n.taskId === taskId : !n.taskId),
    { userId },
  );
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getNote(
  id: string,
  userId?: string,
): Promise<Note | null> {
  userId ??= await resolveUserId();
  const n = await db.notes.findById(id);
  return n && n.userId === userId ? n : null;
}

/**
 * Create (no `id`) or update (with `id`) a note. Update only touches notes the
 * caller owns; returns null if the target id isn't found/owned.
 */
export async function upsertNote(
  input: NoteInput,
  userId?: string,
): Promise<Note | null> {
  userId ??= await resolveUserId();
  const now = new Date().toISOString();

  if (input.id) {
    const existing = await getNote(input.id, userId);
    if (!existing) return null;
    return db.notes.update(input.id, {
      title: clean(input.title),
      body: input.body,
      updatedAt: now,
    });
  }

  const note: Note = {
    _id: newId(),
    userId,
    taskId: clean(input.taskId),
    title: clean(input.title),
    body: input.body,
    createdAt: now,
    updatedAt: now,
  };
  return db.notes.insert(note);
}

export async function deleteNote(
  id: string,
  userId?: string,
): Promise<boolean> {
  userId ??= await resolveUserId();
  const existing = await getNote(id, userId);
  if (!existing) return false;
  return db.notes.remove(id);
}

/** Count of notes attached to each task id, for the dashboard's note badges. */
export async function noteCountsByTask(
  userId?: string,
): Promise<Record<string, number>> {
  userId ??= await resolveUserId();
  const rows = await db.notes.find(
    (n) => n.userId === userId && !!n.taskId,
    { userId },
  );
  const counts: Record<string, number> = {};
  for (const n of rows) counts[n.taskId!] = (counts[n.taskId!] ?? 0) + 1;
  return counts;
}
