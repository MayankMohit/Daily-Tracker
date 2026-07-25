// Per-user daily AI rate limiting (plan §4.1). Keeps a counter doc per
// (user, day) and refuses further calls once the cap is hit, so a runaway loop
// or an over-eager user can't burn through the Gemini quota.

import { db } from "@/lib/store/db";
import { todayKey } from "@/lib/date";
import { AiError } from "./gemini";

/** Default calls allowed per user per day (override with AI_DAILY_CAP). */
const DAILY_CAP = Number(process.env.AI_DAILY_CAP || 30);

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
  const date = todayKey();
  const id = counterId(userId, date);
  const existing = await db.aiUsageCounters.findById(id);

  if ((existing?.callsMade ?? 0) >= DAILY_CAP) {
    throw new AiError(
      `Daily AI limit reached (${DAILY_CAP} requests). Try again tomorrow.`,
      429,
    );
  }

  await db.aiUsageCounters.upsert(
    (c) => c._id === id,
    () => ({
      _id: id,
      scope: userId,
      date,
      callsMade: 0,
      callsByFeature: {},
    }),
    {
      callsMade: (existing?.callsMade ?? 0) + 1,
      callsByFeature: {
        ...(existing?.callsByFeature ?? {}),
        [feature]: (existing?.callsByFeature?.[feature] ?? 0) + 1,
      },
    },
    { _id: id },
  );
}
