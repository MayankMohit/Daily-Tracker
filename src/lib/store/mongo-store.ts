// MongoDB / Mongoose store adapter.
//
// Implements the same generic `Collection<T>` interface as the local file store
// (`local-store.ts`), so switching backends is a one-line change in the store
// selector (`index.ts`) — the repository (`db.ts`) and everything above it are
// unaffected.
//
// Documents use our own string `_id` (nanoid), so the schema declares `_id` as a
// String and runs with `strict: false` (we persist whatever shape the domain
// types have). The predicate-based `find`/`findOne`/`removeWhere` operations load
// the (small, per-user) collection and filter in JS to preserve identical
// semantics to the local store. Data volumes here are tiny; if this ever needs to
// scale, these can be turned into real Mongo queries without changing callers.

import mongoose from "mongoose";
import type { Collection, Doc, StoreFilter } from "./local-store";

// Cache the connection promise on the global object so Next's dev hot-reload and
// the separate route/render module instances all share one pooled connection.
const g = globalThis as unknown as { __mongooseConn?: Promise<typeof mongoose> };

function connect(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!g.__mongooseConn) {
    g.__mongooseConn = mongoose.connect(uri, { bufferCommands: false });
  }
  return g.__mongooseConn;
}

// One permissive model per collection name. `strict: false` lets us store the
// full domain document; lean() reads return plain POJOs including all fields.
// Every domain document is scoped by `userId` and most by a `date` day-key, so a
// compound index on both makes the per-user, per-range queries below index-backed
// instead of collection scans as data grows across users.
function model(name: string): mongoose.Model<Doc> {
  const existing = mongoose.models[name] as mongoose.Model<Doc> | undefined;
  if (existing) return existing;
  const schema = new mongoose.Schema(
    { _id: { type: String } },
    { strict: false, versionKey: false, collection: name },
  );
  schema.index({ userId: 1, date: 1 });
  return mongoose.model<Doc>(name, schema);
}

function clean<T extends Doc>(d: unknown): T {
  const o = d as Record<string, unknown> & T;
  if (o && "__v" in o) delete (o as Record<string, unknown>).__v;
  return o;
}

function makeCollection<T extends Doc>(name: string): Collection<T> {
  const M = () => model(name);

  // Load documents, optionally narrowing the DB query with a Mongo filter so we
  // don't drag the whole (multi-user) collection over the wire. The caller's JS
  // predicate is still applied afterwards, so results match the local store even
  // if the filter is looser than the predicate.
  const load = async (filter?: StoreFilter): Promise<T[]> => {
    await connect();
    const docs = await M()
      .find(filter ?? {})
      .lean();
    return docs as unknown as T[];
  };

  return {
    all: async () => (await load()).map((d) => clean<T>(d)),
    find: async (pred, filter) =>
      (await load(filter)).filter(pred).map((d) => clean<T>(d)),
    findOne: async (pred, filter) => {
      const found = (await load(filter)).find(pred);
      return found ? clean<T>(found) : null;
    },
    findById: async (id) => {
      await connect();
      const found = await M().findById(id).lean();
      return found ? clean<T>(found) : null;
    },
    insert: async (doc) => {
      await connect();
      await M().create(doc);
      return doc;
    },
    update: async (id, patch) => {
      await connect();
      const found = await M()
        .findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after" })
        .lean();
      return found ? clean<T>(found) : null;
    },
    upsert: async (pred, make, patch, filter) => {
      const docs = await load(filter);
      const match = docs.find(pred);
      if (!match) {
        const created = { ...make(), ...patch };
        await M().create(created);
        return created;
      }
      await connect();
      const found = await M()
        .findByIdAndUpdate(match._id, { $set: patch }, { returnDocument: "after" })
        .lean();
      return clean<T>(found);
    },
    remove: async (id) => {
      await connect();
      const res = await M().findByIdAndDelete(id);
      return !!res;
    },
    removeWhere: async (pred, filter) => {
      const docs = await load(filter);
      const ids = docs.filter(pred).map((d) => d._id);
      if (ids.length === 0) return 0;
      await connect();
      const res = await M().deleteMany({ _id: { $in: ids } });
      return res.deletedCount ?? ids.length;
    },
  };
}

const collections = new Map<string, Collection<Doc>>();

export function collection<T extends Doc>(name: string): Collection<T> {
  if (!collections.has(name)) {
    collections.set(name, makeCollection<Doc>(name));
  }
  return collections.get(name) as unknown as Collection<T>;
}
