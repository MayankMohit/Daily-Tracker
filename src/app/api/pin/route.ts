import { ok, fail, parseBody, handler } from "@/lib/api";
import { pinSchema, pinChangeSchema, pinDisableSchema } from "@/lib/schemas";
import { checkRate } from "@/lib/rate-limit";
import { resolveUserId } from "@/lib/auth";
import {
  isPinEnabled,
  hasResetToken,
  setPin,
  verifyPin,
  verifyResetToken,
  regenerateResetToken,
  disablePin,
} from "@/lib/services/pin";

// App-lock PIN (privacy layer over Clerk). The stored hashes/salts never leave the
// server — only `{ enabled }`, pass/fail results, and a freshly-minted recovery
// code (shown once at enable/regenerate) are ever returned. All verbs inherit
// auth + the general per-user burst cap via `handler()`; the proof-checking verbs
// add a tighter per-user cap so neither the PIN nor the recovery code is
// brute-forceable.

// Report whether a PIN is set (drives the Settings card + the navbar lock button)
// and whether a recovery code exists (so a pre-feature PIN can be prompted to mint
// one). `hasRecoveryCode` is only meaningful while enabled.
export const GET = handler(async () => {
  const enabled = await isPinEnabled();
  return ok({
    enabled,
    hasRecoveryCode: enabled ? await hasResetToken() : false,
  });
});

// Enable (body: { pin }) or change (body: { current, pin }). Changing requires
// proving the current PIN first. Both return `recoveryCode` when a new one was
// minted (first enable, or backfilling a pre-feature PIN) — else null.
export const POST = handler(async (req: Request) => {
  if (await isPinEnabled()) {
    const { data, error } = await parseBody(req, pinChangeSchema);
    if (error) return error;
    if (!(await verifyPin(data.current)))
      return fail("Current PIN is incorrect", 401);
    const { recoveryCode } = await setPin(data.pin);
    return ok({ enabled: true, recoveryCode });
  }
  const { data, error } = await parseBody(req, pinSchema);
  if (error) return error;
  const { recoveryCode } = await setPin(data.pin);
  return ok({ enabled: true, recoveryCode });
});

// Verify a PIN to unlock. Tightly rate-limited on top of the general cap so the
// 10,000-combination space can't be brute-forced (a thrown RateLimitError is
// turned into 429 + Retry-After by `handler()`).
export const PATCH = handler(async (req: Request) => {
  const userId = await resolveUserId();
  checkRate(`pin:verify:${userId}`, 10, 60_000);
  const { data, error } = await parseBody(req, pinSchema);
  if (error) return error;
  if (!(await verifyPin(data.pin))) return fail("Incorrect PIN", 401);
  return ok({ unlocked: true });
});

// Regenerate the recovery code (invalidates the old one). Requires proving the
// current PIN — also the path for a pre-feature PIN to obtain its first code.
export const PUT = handler(async (req: Request) => {
  const userId = await resolveUserId();
  checkRate(`pin:verify:${userId}`, 10, 60_000);
  const { data, error } = await parseBody(req, pinSchema);
  if (error) return error;
  if (!(await verifyPin(data.pin))) return fail("Incorrect PIN", 401);
  const recoveryCode = await regenerateResetToken(userId);
  if (!recoveryCode) return fail("No PIN is set", 400);
  return ok({ recoveryCode });
});

// Turn the lock off. Must prove it: the current PIN (Settings "turn off") or the
// saved recovery code (lock-screen "forgot PIN"). This replaces the old no-proof
// reset, which let anyone holding the signed-in session clear the lock in a click.
export const DELETE = handler(async (req: Request) => {
  const userId = await resolveUserId();
  // Nothing to remove — treat as success so the UI can settle to "off".
  if (!(await isPinEnabled(userId))) return ok({ enabled: false });

  checkRate(`pin:verify:${userId}`, 10, 60_000);
  const { data, error } = await parseBody(req, pinDisableSchema);
  if (error) return error;

  const proven = data.pin
    ? await verifyPin(data.pin)
    : await verifyResetToken(data.resetToken!);
  if (!proven)
    return fail(
      data.resetToken ? "Incorrect recovery code" : "Incorrect PIN",
      401,
    );

  await disablePin(userId);
  return ok({ enabled: false });
});
