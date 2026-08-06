// A tiny typed seam over a `window` CustomEvent, used to make task creation feel
// instant across component trees. The "New task" button and the AI quick-add
// live at the top of the dashboard page, *outside* the TaskTable that renders the
// rows — they're siblings under a server component, so they can't share React
// state directly. Rather than lift the whole task list into a client provider,
// we broadcast the freshly-created task (already returned by the API) and let the
// table splice it into its local order immediately, before the slower
// `router.refresh()` round-trip reconciles the authoritative list.
//
// This mirrors the app's existing cross-component signalling (pin:enabled,
// timezone:changed, …) — small, explicit browser events — but keeps it typed so
// callers can't drift on the event name or payload shape.

import type { Task } from "./types";

const TASK_CREATED = "task:created";

/** Announce a task the server just created, so any live table can show it now. */
export function emitTaskCreated(task: Task): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Task>(TASK_CREATED, { detail: task }));
}

/** Subscribe to task-created broadcasts. Returns an unsubscribe function. */
export function onTaskCreated(handler: (task: Task) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<Task>).detail);
  window.addEventListener(TASK_CREATED, listener);
  return () => window.removeEventListener(TASK_CREATED, listener);
}
