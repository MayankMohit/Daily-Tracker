// App-lock PIN — an optional privacy layer *on top of* Clerk auth. The PIN gates
// a client-side lock screen; here we own the server side: a hashed PIN so the raw
// value is never stored, verified in constant time and rate-limited at the route.
//
// The secret (hash + salt) never leaves the server — callers only ever learn
// whether a PIN is set (`isPinEnabled`) or whether a candidate matches
// (`verifyPin`). Mirrors the journal-key pattern: a dedicated collection so the
// secret never rides on `UserPrefs` (which is sent to the client).

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { PinLockDoc } from "@/lib/types";

// scrypt output length in bytes. 64 is a comfortable, standard choice.
const KEYLEN = 64;

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, KEYLEN).toString("hex");
}

/** Whether the user has an app-lock PIN set. */
export async function isPinEnabled(userId?: string): Promise<boolean> {
  userId ??= await resolveUserId();
  const doc = await db.pinLocks.findById(userId);
  return doc !== null;
}

/** Create or replace the user's PIN (used for both first-time enable and change). */
export async function setPin(pin: string, userId?: string): Promise<void> {
  userId ??= await resolveUserId();
  const salt = randomBytes(16).toString("hex");
  const hash = hashPin(pin, salt);
  const now = new Date().toISOString();
  await db.pinLocks.upsert(
    (d) => d._id === userId,
    () => ({ _id: userId!, userId: userId!, hash, salt, updatedAt: now }),
    { hash, salt, updatedAt: now },
    { _id: userId },
  );
}

/** Constant-time check of a candidate PIN against the stored hash. */
export async function verifyPin(pin: string, userId?: string): Promise<boolean> {
  userId ??= await resolveUserId();
  const doc: PinLockDoc | null = await db.pinLocks.findById(userId);
  if (!doc) return false;
  const candidate = Buffer.from(hashPin(pin, doc.salt), "hex");
  const stored = Buffer.from(doc.hash, "hex");
  // timingSafeEqual throws if lengths differ; equal length is guaranteed here
  // (same KEYLEN), but guard anyway so a malformed stored doc can't crash.
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Turn the lock off (also the "forgot PIN → reset" path — no PIN required). */
export async function disablePin(userId?: string): Promise<void> {
  userId ??= await resolveUserId();
  await db.pinLocks.remove(userId);
}
