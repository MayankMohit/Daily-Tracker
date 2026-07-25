// Resolves the active user id for data scoping (server-only).
//
// Every service function is keyed by `userId`. When a caller doesn't pass one
// explicitly, it resolves here to the signed-in Clerk user. If Clerk isn't
// configured (no keys — zero-config local dev) we fall back to the fixed
// single-user id, so the app still runs against the local JSON store.
//
// Internal service→service calls pass a concrete userId, so this only actually
// hits Clerk's `auth()` once per request (at the entry point).

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { CURRENT_USER_ID } from "./config";

/** Whether Clerk credentials are present. Evaluated once at module load. */
export const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);

// `cache` dedupes within a single request: a page render calls resolveUserId()
// through the layout, getActiveDay, and every un-scoped service call — without
// this that's a fresh Clerk `auth()` each time. Memoizing collapses them to one.
export const resolveUserId = cache(async (): Promise<string> => {
  if (!clerkConfigured) return CURRENT_USER_ID;
  const { userId } = await auth();
  return userId ?? CURRENT_USER_ID;
});
