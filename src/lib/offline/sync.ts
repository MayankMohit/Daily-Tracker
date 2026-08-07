// Offline sync — replays the outbox against the real API when back online.
//
// Runs FIFO so a create always lands before the edits/deletes that depend on it.
// As each create replays, we learn its real server id and remap every later
// queued reference to the `local-…` id (a check-off on an offline-created task,
// a reorder list, an edit of an offline note, …). See lib/offline/outbox.

import {
  outboxAll,
  outboxRemove,
  outboxCount,
  emit,
  OUTBOX_CHANGED,
  OUTBOX_DRAINED,
  type OutboxRecord,
} from "./outbox";

// Rewrite any `local-…` id found in a value (deep) using the temp→real map.
function remapDeep(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === "string") return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapDeep(v, map));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = remapDeep(v, map);
    }
    return out;
  }
  return value;
}

function remapUrl(url: string, map: Map<string, string>): string {
  let out = url;
  for (const [temp, real] of map) out = out.split(temp).join(real);
  return out;
}

let draining = false;

/** Replay the queue. Safe to call repeatedly / concurrently (guarded). Stops on
 *  the first network error (keeps the rest for next time); drops records the
 *  server rejects as unreplayable (4xx). */
export async function drainOutbox(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (draining) return;
  draining = true;
  try {
    const records = await outboxAll();
    const idMap = new Map<string, string>(); // tempId → real server id
    for (const rec of records) {
      const url = remapUrl(rec.url, idMap);
      const body = rec.body === undefined ? undefined : remapDeep(rec.body, idMap);
      let res: Response;
      try {
        res = await fetch(url, {
          method: rec.method,
          headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        break; // network dropped again — leave this and the rest for next time
      }
      if (!res.ok) {
        // 4xx = permanently unreplayable (validation / already-gone); drop it.
        // 5xx = transient (server/db) — stop and retry the whole tail later.
        if (res.status >= 400 && res.status < 500) {
          await dropRecord(rec);
          continue;
        }
        break;
      }
      // Learn the real id for a create so later references can be remapped.
      if (rec.tempId) {
        try {
          const json = (await res.clone().json()) as { data?: { _id?: string } };
          const realId = json?.data?._id;
          if (realId) idMap.set(rec.tempId, realId);
        } catch {
          /* non-JSON success — nothing to map */
        }
      }
      await dropRecord(rec);
    }
  } finally {
    draining = false;
  }
  if ((await outboxCount()) === 0) emit(OUTBOX_DRAINED);
}

async function dropRecord(rec: OutboxRecord): Promise<void> {
  if (rec.id === undefined) return;
  await outboxRemove(rec.id);
  emit(OUTBOX_CHANGED);
}

let wired = false;

/** Wire up automatic draining: on reconnect, on load (if already online), and
 *  when the service worker's Background Sync fires. Idempotent. */
export function startOfflineSync(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;

  const kick = () => void drainOutbox();

  window.addEventListener("online", kick);
  if (navigator.onLine) kick();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "drain-outbox") kick();
    });
  }
}
