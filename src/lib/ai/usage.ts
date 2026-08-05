// Per-user daily AI rate limiting (plan §4.1). Keeps a counter doc per
// (user, day) and refuses further calls once the cap is hit, so a runaway loop
// or an over-eager user can't burn through the Gemini quota.

import { db } from "@/lib/store/db";
import { todayKey } from "@/lib/date";
import { checkRate, RateLimitError } from "@/lib/rate-limit";
import { AiError } from "./gemini";

/** Default calls allowed per user per day (override with AI_DAILY_CAP). */
const DAILY_CAP = Number(process.env.AI_DAILY_CAP || 30);
/** Short-window burst cap so a runaway loop can't drain the daily quota in one
 *  go. In-memory + synchronous, so it's genuinely atomic within the process. */
const PER_MIN_CAP = Number(process.env.AI_PER_MIN_CAP || 5);

function counterId(userId: string, date: string): string {
  return `${userId}|${date}`;
}

export interface UsageStatus {
  used: number;
  cap: number;
  remaining: number;
}

export async function getUsage(userId: string): Promise<UsageStatus> {
  const date = todayKey();
  const doc = await db.aiUsageCounters.findById(counterId(userId, date));
  const used = doc?.callsMade ?? 0;
  return { used, cap: DAILY_CAP, remaining: Math.max(0, DAILY_CAP - used) };
}

/**
 * Reserve one AI call for `feature`. Throws AiError(429) if the daily cap is
 * exceeded. Call this right before hitting Gemini.
 */
export async function reserveCall(
  userId: string,
  feature: string,
): Promise<void> {
  // 1) Per-minute burst throttle (in-memory, atomic within the process).
  try {
    checkRate(`ai:${userId}`, PER_MIN_CAP, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) {
      throw new AiError(
        `Too many AI requests in a short time. Try again in ${e.retryAfter}s.`,
        429,
      );
    }
    throw e;
  }

  // 2) Daily cap — a single atomic conditional increment closes the read-then-
  //    write race two concurrent calls could otherwise use to slip past the cap.
  const date = todayKey();
  const id = counterId(userId, date);
  const updated = await db.aiUsageCounters.bumpCounter(
    id,
    () => ({
      _id: id,
      scope: userId,
      date,
      callsMade: 0,
      callsByFeature: {},
    }),
    "callsMade",
    DAILY_CAP,
    { callsMade: 1, [`callsByFeature.${feature}`]: 1 },
  );

  if (!updated) {
    throw new AiError(
      `Daily AI limit reached (${DAILY_CAP} requests). Try again tomorrow.`,
      429,
    );
  }
}
