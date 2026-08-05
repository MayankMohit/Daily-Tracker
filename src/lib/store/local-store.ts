// Local file-based data store (dev / no-MongoDB mode, plan decision: "None yet").
//
// Persists all collections to a single gitignored JSON file under `.data/`.
// It implements the same generic `Collection<T>` interface a future Mongoose
// adapter will, so swapping to MongoDB Atlas later is a store-level change only —
// the repository (`db.ts`) and everything above it stay the same.
//
// Design note: we deliberately do NOT keep a long-lived in-memory cache. In Next
// dev the API route handlers and the page render in separate module instances;
// a per-instance cache goes stale across them (and two caches racing to write the
// file lose data). So every operation reads the file fresh, and all operations
// are serialized through one promise chain so concurrent handlers can't clobber
// each other or read a half-written file. The data set is tiny and single-user,
// so per-op file I/O is a non-issue.

import { promises as fs } from "fs";
import path from "path";

export interface Doc {
  _id: string;
}

/**
 * Optional MongoDB-style filter passed alongside a JS predicate on reads. It is a
 * pure *performance hint*: the Mongo backend uses it to fetch only the matching
 * documents instead of the whole collection, then still applies the predicate so
 * results are identical to the local backend (which ignores the filter entirely).
 * Keep the filter a subset of what the predicate checks so the two never diverge.
 */
export type StoreFilter = Record<string, unknown>;

type DB = Record<string, Doc[]>;

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

let chain: Promise<unknown> = Promise.resolve();

async function readDb(): Promise<DB> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as DB;
  } catch {
    return {};
  }
}

async function writeDb(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

/** Run `task` after all previously-queued store operations complete. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function read<T>(fn: (db: DB) => T): Promise<T> {
  return enqueue(async () => fn(await readDb()));
}

function mutate<T>(fn: (db: DB) => T): Promise<T> {
  return enqueue(async () => {
    const db = await readDb();
    const out = fn(db);
    await writeDb(db);
    return out;
  });
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

export interface Collection<T extends Doc> {
  all(): Promise<T[]>;
  find(pred: (d: T) => boolean, filter?: StoreFilter): Promise<T[]>;
  findOne(pred: (d: T) => boolean, filter?: StoreFilter): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  insert(doc: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  /** Update the first doc matching `pred`, or insert `make()` if none exists. */
  upsert(
    pred: (d: T) => boolean,
    make: () => T,
    patch: Partial<T>,
    filter?: StoreFilter,
  ): Promise<T>;
  remove(id: string): Promise<boolean>;
  removeWhere(pred: (d: T) => boolean, filter?: StoreFilter): Promise<number>;
  /**
   * Race-free counter bump for rate limiting. Ensures a doc `id` exists (seeded
   * from `make()` on first hit), then — only while its `guardField` is still
   * below `cap` — atomically applies every increment in `inc` and returns the
   * updated doc. Returns null when the guard already rejects (cap reached), with
   * no increment applied. `inc` keys may be one-level dot-paths, e.g.
   * `"callsByFeature.summary"`. Both backends implement this atomically within
   * their own consistency domain (Mongo via a conditional `$inc`, the local
   * store within its serialized write).
   */
  bumpCounter(
    id: string,
    make: () => T,
    guardField: string,
    cap: number,
    inc: Record<string, number>,
  ): Promise<T | null>;
}

function makeCollection<T extends Doc>(name: string): Collection<T> {
  // Get (and lazily create) this collection's array within a loaded db.
  const list = (db: DB): T[] => {
    if (!db[name]) db[name] = [];
    return db[name] as unknown as T[];
  };

  return {
    all: () => read((db) => clone(list(db))),
    find: (pred) => read((db) => clone(list(db).filter(pred))),
    findOne: (pred) =>
      read((db) => {
        const found = list(db).find(pred);
        return found ? clone(found) : null;
      }),
    findById: (id) =>
      read((db) => {
        const found = list(db).find((d) => d._id === id);
        return found ? clone(found) : null;
      }),
    insert: (doc) =>
      mutate((db) => {
        list(db).push(doc);
        return clone(doc);
      }),
    update: (id, patch) =>
      mutate((db) => {
        const l = list(db);
        const idx = l.findIndex((d) => d._id === id);
        if (idx === -1) return null;
        l[idx] = { ...l[idx], ...patch };
        return clone(l[idx]);
      }),
    upsert: (pred, make, patch) =>
      mutate((db) => {
        const l = list(db);
        const idx = l.findIndex(pred);
        if (idx === -1) {
          const created = { ...make(), ...patch };
          l.push(created);
          return clone(created);
        }
        l[idx] = { ...l[idx], ...patch };
        return clone(l[idx]);
      }),
    remove: (id) =>
      mutate((db) => {
        const l = list(db);
        const idx = l.findIndex((d) => d._id === id);
        if (idx === -1) return false;
        l.splice(idx, 1);
        return true;
      }),
    removeWhere: (pred) =>
      mutate((db) => {
        const l = list(db);
        const before = l.length;
        db[name] = l.filter((d) => !pred(d)) as unknown as Doc[];
        return before - db[name].length;
      }),
    bumpCounter: (id, make, guardField, cap, inc) =>
      // The whole check-then-increment runs inside a single serialized mutate,
      // so it's atomic against other store ops in this process.
      mutate((db) => {
        const l = list(db);
        let idx = l.findIndex((d) => d._id === id);
        if (idx === -1) {
          l.push(make());
          idx = l.length - 1;
        }
        const doc = l[idx] as unknown as Record<string, unknown>;
        if (Number(doc[guardField] ?? 0) >= cap) return null;
        for (const [pathKey, delta] of Object.entries(inc)) {
          const dot = pathKey.indexOf(".");
          if (dot === -1) {
            doc[pathKey] = Number(doc[pathKey] ?? 0) + delta;
          } else {
            const head = pathKey.slice(0, dot);
            const leaf = pathKey.slice(dot + 1);
            const nested = (doc[head] ??= {}) as Record<string, unknown>;
            nested[leaf] = Number(nested[leaf] ?? 0) + delta;
          }
        }
        return clone(l[idx]);
      }),
  };
}

const collections = new Map<string, Collection<Doc>>();

/** Get (and lazily create) a typed collection by name. */
export function collection<T extends Doc>(name: string): Collection<T> {
  if (!collections.has(name)) {
    collections.set(name, makeCollection<Doc>(name));
  }
  return collections.get(name) as unknown as Collection<T>;
}
