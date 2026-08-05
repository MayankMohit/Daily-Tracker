import { ok, fail, parseBody, handler } from "@/lib/api";
import { pinSchema, pinChangeSchema } from "@/lib/schemas";
import { checkRate } from "@/lib/rate-limit";
import { resolveUserId } from "@/lib/auth";
import {
  isPinEnabled,
  setPin,
  verifyPin,
  disablePin,
} from "@/lib/services/pin";

// App-lock PIN (privacy layer over Clerk). The stored hash/salt never leave the
// server — only `{ enabled }` and pass/fail results are ever returned.
// All verbs inherit auth + the general per-user burst cap via `handler()`.

// Report whether a PIN is set (drives the Settings card + the navbar lock button).
export const GET = handler(async () => {
  return ok({ enabled: await isPinEnabled() });
});

// Enable (body: { pin }) or change (body: { current, pin }). Changing requires
// proving the current PIN first.
export const POST = handler(async (req: Request) => {
  if (await isPinEnabled()) {
    const { data, error } = await parseBody(req, pinChangeSchema);
    if (error) return error;
    if (!(await verifyPin(data.current)))
      return fail("Current PIN is incorrect", 401);
    await setPin(data.pin);
    return ok({ enabled: true });
  }
  const { data, error } = await parseBody(req, pinSchema);
  if (error) return error;
  await setPin(data.pin);
  return ok({ enabled: true });
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

// Turn the lock off — also the "forgot PIN → reset" path (no PIN required, per
// the reset-while-signed-in choice; the user is already Clerk-authenticated).
export const DELETE = handler(async () => {
  await disablePin();
  return ok({ enabled: false });
});
