// App-lock PIN — an optional privacy layer *on top of* Clerk auth. The PIN gates
// a client-side lock screen; here we own the server side: a hashed PIN so the raw
// value is never stored, verified in constant time and rate-limited at the route.
//
// The secret (hash + salt) never leaves the server — callers only ever learn
// whether a PIN is set (`isPinEnabled`) or whether a candidate matches
// (`verifyPin`). Mirrors the journal-key pattern: a dedicated collection so the
// secret never rides on `UserPrefs` (which is sent to the client).
//
// Recovery: enabling the lock also mints a high-entropy recovery code, shown to
// the user *once* to save (e.g. in a password manager). Only its hash is stored,
// so — like the PIN — the raw code never persists and can't be read back by
// anyone holding the signed-in session. Resetting a forgotten PIN requires that
// code (see `verifyResetToken`); without it, whoever grabbed an unlocked device
// can't clear the lock. The code is independent of the PIN, so changing the PIN
// preserves it.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { PinLockDoc } from "@/lib/types";

// scrypt output length in bytes. 64 is a comfortable, standard choice.
const KEYLEN = 64;

function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, KEYLEN).toString("hex");
}

/** Constant-time compare of a freshly hashed candidate against a stored hash. */
function hashesMatch(candidateHex: string, storedHex: string): boolean {
  const candidate = Buffer.from(candidateHex, "hex");
  const stored = Buffer.from(storedHex, "hex");
  // timingSafeEqual throws if lengths differ; equal length is guaranteed here
  // (same KEYLEN), but guard anyway so a malformed stored doc can't crash.
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** A new recovery code: 120 bits, url-safe, copy-paste friendly (no padding). */
function newRecoveryCode(): string {
  return randomBytes(15).toString("base64url");
}

/** Whether the user has an app-lock PIN set. */
export async function isPinEnabled(userId?: string): Promise<boolean> {
  userId ??= await resolveUserId();
  const doc = await db.pinLocks.findById(userId);
  return doc !== null;
}

/**
 * Create or replace the user's PIN (used for both first-time enable and change).
 * On first enable — or for a PIN predating recovery codes — this also mints a
 * recovery code and returns it (the only time the raw code exists); the caller
 * must show it once. On a plain change it preserves the existing code and returns
 * `{ recoveryCode: null }`.
 */
export async function setPin(
  pin: string,
  userId?: string,
): Promise<{ recoveryCode: string | null }> {
  userId ??= await resolveUserId();
  const existing = await db.pinLocks.findById(userId);
  const salt = randomBytes(16).toString("hex");
  const hash = hashSecret(pin, salt);
  const now = new Date().toISOString();

  // Keep any existing recovery code (it's independent of the PIN). Mint one only
  // when none exists yet — first enable, or a pre-feature PIN being changed.
  let recoveryCode: string | null = null;
  let resetHash = existing?.resetHash;
  let resetSalt = existing?.resetSalt;
  if (!resetHash || !resetSalt) {
    recoveryCode = newRecoveryCode();
    resetSalt = randomBytes(16).toString("hex");
    resetHash = hashSecret(recoveryCode, resetSalt);
  }

  await db.pinLocks.upsert(
    (d) => d._id === userId,
    () => ({ _id: userId!, userId: userId!, hash, salt, resetHash, resetSalt, updatedAt: now }),
    { hash, salt, resetHash, resetSalt, updatedAt: now },
    { _id: userId },
  );
  return { recoveryCode };
}

/** Constant-time check of a candidate PIN against the stored hash. */
export async function verifyPin(pin: string, userId?: string): Promise<boolean> {
  userId ??= await resolveUserId();
  const doc: PinLockDoc | null = await db.pinLocks.findById(userId);
  if (!doc) return false;
  return hashesMatch(hashSecret(pin, doc.salt), doc.hash);
}

/** Constant-time check of a candidate recovery code. False if the user never got
 *  one (a pre-feature PIN) — the route then steers them to Settings instead. */
export async function verifyResetToken(
  token: string,
  userId?: string,
): Promise<boolean> {
  userId ??= await resolveUserId();
  const doc: PinLockDoc | null = await db.pinLocks.findById(userId);
  if (!doc?.resetHash || !doc.resetSalt) return false;
  return hashesMatch(hashSecret(token.trim(), doc.resetSalt), doc.resetHash);
}

/** Whether the user has a recovery code on file (drives the Settings prompt to
 *  generate one for PINs created before this feature). */
export async function hasResetToken(userId?: string): Promise<boolean> {
  userId ??= await resolveUserId();
  const doc = await db.pinLocks.findById(userId);
  return Boolean(doc?.resetHash && doc.resetSalt);
}

/** Mint a fresh recovery code (invalidating the old one), returning it once.
 *  Null if no PIN is set. Callers must first prove the current PIN. */
export async function regenerateResetToken(
  userId?: string,
): Promise<string | null> {
  userId ??= await resolveUserId();
  const doc = await db.pinLocks.findById(userId);
  if (!doc) return null;
  const recoveryCode = newRecoveryCode();
  const resetSalt = randomBytes(16).toString("hex");
  const resetHash = hashSecret(recoveryCode, resetSalt);
  await db.pinLocks.update(userId, {
    resetHash,
    resetSalt,
    updatedAt: new Date().toISOString(),
  });
  return recoveryCode;
}

/** Turn the lock off. Callers must first prove the current PIN or recovery code
 *  (see the route) — this is the raw removal. */
export async function disablePin(userId?: string): Promise<void> {
  userId ??= await resolveUserId();
  await db.pinLocks.remove(userId);
}
