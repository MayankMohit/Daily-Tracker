// Store selector: pick the backend at runtime.
//
// If MONGODB_URI is configured we use the Mongoose adapter (MongoDB Atlas);
// otherwise we fall back to the local JSON file store for zero-config dev. Both
// implement the identical `Collection<T>` interface, so the repository (`db.ts`)
// and all services are unaware of which one is active.

import type { Collection, Doc } from "./local-store";
import { collection as localCollection } from "./local-store";
import { collection as mongoCollection } from "./mongo-store";

const useMongo = Boolean(process.env.MONGODB_URI);

export function collection<T extends Doc>(name: string): Collection<T> {
  return useMongo ? mongoCollection<T>(name) : localCollection<T>(name);
}

export type { Collection, Doc };

/** Which backend is active — handy for a startup log / health check. */
export const STORE_BACKEND = useMongo ? "mongodb" : "local-file";
