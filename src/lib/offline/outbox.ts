// Offline outbox — a durable FIFO queue of mutations made while offline.
//
// Every client mutation flows through the `api` wrapper (lib/client). When the
// network is unavailable, `api` drops the request in here (IndexedDB, so it
// survives a reload/close) and hands the caller a *synthetic* optimistic result
// so the already-optimistic UIs keep working. On reconnect, lib/offline/sync
// drains the queue in order and replays each request against the real API.
//
// This module owns: the IndexedDB store, request classification (which endpoints
// are queueable + whether a request is a create), the synthetic response shape,
// and a tiny window-event bus the indicator/sync layers subscribe to.

const DB_NAME = "dt-offline";
const STORE = "outbox";
const DB_VERSION = 1;

/** A single queued mutation. `id` is the autoincrement key (also the FIFO order). */
export interface OutboxRecord {
  id?: number;
  method: string;
  url: string;
  body?: unknown;
  /** Coarse category, used by the drainer for temp-id reconciliation + logging. */
  kind: string;
  /** For creates: the `local-…` id we handed the UI, mapped to the real id on replay. */
  tempId?: string;
  createdAt: number;
}

// ── IndexedDB plumbing ───────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/** Append a record; returns its assigned id. */
export async function outboxAdd(rec: OutboxRecord): Promise<number> {
  return tx("readwrite", (s) => s.add(rec) as IDBRequest<number>);
}

/** All records in FIFO (insertion) order. */
export async function outboxAll(): Promise<OutboxRecord[]> {
  const rows = await tx<OutboxRecord[]>(
    "readonly",
    (s) => s.getAll() as IDBRequest<OutboxRecord[]>,
  );
  return rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function outboxRemove(id: number): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

export async function outboxCount(): Promise<number> {
  try {
    return await tx<number>("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

// ── event bus (same-window; SSR-safe) ────────────────────────────────────────

export const OUTBOX_CHANGED = "dt-outbox-changed"; // queue length changed
export const OUTBOX_DRAINED = "dt-outbox-drained"; // queue emptied after a sync

export function emit(event: typeof OUTBOX_CHANGED | typeof OUTBOX_DRAINED): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(event));
}

// ── classification ───────────────────────────────────────────────────────────

// Endpoints that need a live server/network — never queued. They fail offline
// with their components' existing error handling.
const EXCLUDED = [
  /^\/api\/ai\//,
  /^\/api\/backgrounds/,
  /^\/api\/pin/,
  /^\/api\/journal\/(security|rekey|legacy)/,
  /^\/api\/export/,
];

export function isExcluded(url: string): boolean {
  const path = url.split("?")[0];
  return EXCLUDED.some((re) => re.test(path));
}

type BodyObj = Record<string, unknown>;

/** Classify a mutation, or return null when the endpoint isn't queueable (then
 *  `api` lets it fail normally offline rather than silently swallowing it). */
export function classify(
  url: string,
  method: string,
  body: unknown,
): { kind: string; isCreate: boolean } | null {
  const path = url.split("?")[0];
  const b = (body ?? {}) as BodyObj;
  const has = (id: unknown) => typeof id === "string" && id.length > 0;

  if (path === "/api/task-logs" && method === "POST") return { kind: "log", isCreate: false };
  if (path === "/api/mood" && method === "POST") return { kind: "mood", isCreate: false };
  if (path === "/api/prefs" && method === "PATCH") return { kind: "prefs", isCreate: false };
  if (path === "/api/journal" && method === "POST") return { kind: "journal", isCreate: false };

  if (path === "/api/notes" && method === "POST")
    return { kind: "note-upsert", isCreate: !has(b.id) };
  if (/^\/api\/notes\/[^/]+$/.test(path) && method === "DELETE")
    return { kind: "note-delete", isCreate: false };

  if (path === "/api/extra-activities" && method === "POST")
    return { kind: "extra-create", isCreate: true };
  if (/^\/api\/extra-activities\/[^/]+$/.test(path) && method === "DELETE")
    return { kind: "extra-delete", isCreate: false };

  if (path === "/api/tasks" && method === "POST") return { kind: "task-create", isCreate: true };
  if (path === "/api/tasks/reorder" && method === "POST")
    return { kind: "task-reorder", isCreate: false };
  if (/^\/api\/tasks\/[^/]+$/.test(path) && (method === "PATCH" || method === "DELETE"))
    return { kind: method === "DELETE" ? "task-delete" : "task-update", isCreate: false };

  return null;
}

/** Trailing resource id from a REST-ish path (`/api/tasks/abc?hard=1` → `abc`). */
function idFromUrl(url: string): string | undefined {
  return url.split("?")[0].match(/\/([^/]+)$/)?.[1];
}

export function newLocalId(): string {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `local-${uuid}`;
}

/** Build the optimistic value `api` resolves with for a queued mutation, shaped
 *  to satisfy the callers that read the result (create objects need an `_id`;
 *  upserts echo the body — task-logs' caller falls back to its own optimistic
 *  value, see task-table `commit`). */
export function buildSynthetic(
  url: string,
  kind: string,
  body: unknown,
  tempId: string | undefined,
  isCreate: boolean,
): unknown {
  const now = new Date().toISOString();
  const b = (body ?? {}) as BodyObj;

  if (isCreate) {
    return { ...b, _id: tempId, userId: "local", createdAt: now, updatedAt: now };
  }
  if (kind === "note-upsert") {
    // Update of an existing note — keep its id so follow-up edits keep updating it.
    return { ...b, _id: b.id, userId: "local", updatedAt: now };
  }
  if (kind === "task-update") {
    // Edit keeps the task's id so the list replaces the row instead of adding one.
    return { ...b, _id: idFromUrl(url), userId: "local", createdAt: now };
  }
  // log / mood / prefs / journal / *-delete / reorder — callers ignore the value
  // or reconcile it themselves; a body echo is enough.
  return { ...b };
}

/** Ask the browser to replay the queue when connectivity returns, even if the
 *  tab is later closed (Background Sync). No-op where unsupported (e.g. Safari) —
 *  the `online` event handles those. */
export function requestBackgroundSync(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync;
      return sync?.register("outbox");
    })
    .catch(() => {
      /* unsupported or denied — fine, the online-event path covers it */
    });
}

/** Queue a mutation and return the synthetic optimistic value for the caller. */
export async function enqueue(
  url: string,
  method: string,
  body: unknown,
): Promise<unknown> {
  const cls = classify(url, method, body);
  if (!cls) throw new Error("offline"); // not queueable — surface the failure
  const tempId = cls.isCreate ? newLocalId() : undefined;
  await outboxAdd({ method, url, body, kind: cls.kind, tempId, createdAt: Date.now() });
  emit(OUTBOX_CHANGED);
  requestBackgroundSync();
  return buildSynthetic(url, cls.kind, body, tempId, cls.isCreate);
}
