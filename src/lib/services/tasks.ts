// Task domain logic. Called by both server components (reads) and route handlers
// (writes), so validation/shape lives here once, not per-endpoint.

import { db, newId } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { Task } from "@/lib/types";
import { taskInputSchema, type TaskInput } from "@/lib/schemas";

// Re-exported for server callers; the implementation is a pure module so client
// components (the table) can import it without pulling in the data store.
export { taskAppliesOn } from "@/lib/recurrence";

function emptyToUndef(v?: string): string | undefined {
  return v && v.trim() ? v.trim() : undefined;
}

export async function listTasks(
  userId?: string,
  { includeArchived = false } = {},
): Promise<Task[]> {
  userId ??= await resolveUserId();
  const tasks = await db.tasks.find(
    (t) => t.userId === userId && (includeArchived || t.active),
  );
  return tasks.sort(compareByOrder);
}

// Manual position first (lower = higher up); tasks never reordered have no
// sortOrder and fall to the bottom, tie-broken by creation time so rows stay
// stable.
function compareByOrder(a: Task, b: Task): number {
  const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Persist a new top-to-bottom order for the caller's active tasks. `orderedIds`
 * is the full list of visible task ids in their desired order; any id not owned
 * by the user is ignored. Returns the reordered active tasks.
 */
export async function reorderTasks(
  orderedIds: string[],
  userId?: string,
): Promise<Task[]> {
  userId ??= await resolveUserId();
  // Map current sortOrder so we can skip tasks already in place — a single-row
  // drag only shifts the rows between the old and new slot, so most updates are
  // no-ops we'd rather not write.
  const current = new Map(
    (await listTasks(userId)).map((t) => [t._id, t.sortOrder]),
  );
  let order = 0;
  for (const id of orderedIds) {
    if (!current.has(id)) continue; // not owned / not active
    if (current.get(id) !== order) {
      await db.tasks.update(id, { sortOrder: order } as Partial<Task>);
    }
    order++;
  }
  return listTasks(userId);
}

export async function getTask(
  id: string,
  userId?: string,
): Promise<Task | null> {
  userId ??= await resolveUserId();
  const t = await db.tasks.findById(id);
  return t && t.userId === userId ? t : null;
}

export async function createTask(
  input: TaskInput,
  userId?: string,
): Promise<Task> {
  userId ??= await resolveUserId();
  const parsed = taskInputSchema.parse(input);
  const now = new Date().toISOString();
  const task: Task = {
    _id: newId(),
    userId,
    title: parsed.title.trim(),
    description: emptyToUndef(parsed.description),
    type: parsed.type,
    goal: parsed.goal,
    percentageConfig:
      parsed.type === "percentage" ? parsed.percentageConfig : undefined,
    category: emptyToUndef(parsed.category),
    priority: parsed.priority,
    estimatedDuration: parsed.estimatedDuration,
    recurrence: parsed.recurrence,
    recurrenceDays:
      parsed.recurrence === "custom" ? parsed.recurrenceDays : undefined,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    reminder: parsed.reminder,
    color: parsed.color,
    active: parsed.active,
    createdAt: now,
  };
  return db.tasks.insert(task);
}

export async function updateTask(
  id: string,
  input: Partial<TaskInput>,
  userId?: string,
): Promise<Task | null> {
  userId ??= await resolveUserId();
  const existing = await getTask(id, userId);
  if (!existing) return null;
  // Re-validate the merged result so partial edits still produce a valid task.
  const merged = taskInputSchema.parse({ ...toInput(existing), ...input });
  return db.tasks.update(id, {
    title: merged.title.trim(),
    description: emptyToUndef(merged.description),
    type: merged.type,
    goal: merged.goal,
    percentageConfig:
      merged.type === "percentage" ? merged.percentageConfig : undefined,
    category: emptyToUndef(merged.category),
    priority: merged.priority,
    estimatedDuration: merged.estimatedDuration,
    recurrence: merged.recurrence,
    recurrenceDays:
      merged.recurrence === "custom" ? merged.recurrenceDays : undefined,
    startDate: merged.startDate,
    endDate: merged.endDate,
    reminder: merged.reminder,
    color: merged.color,
    active: merged.active,
  });
}

/** Soft-archive: keeps history (logs) intact but drops the task from the table. */
export async function archiveTask(
  id: string,
  userId?: string,
): Promise<Task | null> {
  userId ??= await resolveUserId();
  const existing = await getTask(id, userId);
  if (!existing) return null;
  return db.tasks.update(id, { active: false });
}

/** Hard delete a task and all of its logs. */
export async function deleteTask(
  id: string,
  userId?: string,
): Promise<boolean> {
  userId ??= await resolveUserId();
  const existing = await getTask(id, userId);
  if (!existing) return false;
  await db.taskLogs.removeWhere((l) => l.taskId === id && l.userId === userId);
  return db.tasks.remove(id);
}

/** Convert a stored Task back into form-input shape for re-validation on edit. */
function toInput(t: Task): TaskInput {
  return {
    title: t.title,
    description: t.description ?? "",
    type: t.type,
    goal: t.goal,
    percentageConfig: t.percentageConfig,
    category: t.category ?? "",
    priority: t.priority,
    estimatedDuration: t.estimatedDuration,
    recurrence: t.recurrence,
    recurrenceDays: t.recurrenceDays,
    startDate: t.startDate,
    endDate: t.endDate,
    reminder: t.reminder,
    color: t.color,
    active: t.active,
  } as TaskInput;
}
