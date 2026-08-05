// User preferences (plan §5 users doc, §3.6, §3.8). With Clerk wired, these are
// keyed by the signed-in user's id; the AI-related prefs feed the Gemini layer.

import {
  db,
  defaultUserPrefs,
  getUserPrefs as getUserPrefsRaw,
} from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { UserPrefs } from "@/lib/types";
import { userPrefsInputSchema, type UserPrefsInput } from "@/lib/schemas";

export async function getUserPrefs(userId?: string): Promise<UserPrefs> {
  userId ??= await resolveUserId();
  return getUserPrefsRaw(userId);
}

export async function saveUserPrefs(
  input: UserPrefsInput,
  userId?: string,
): Promise<UserPrefs> {
  userId ??= await resolveUserId();
  const parsed = userPrefsInputSchema.parse(input);
  const current = await getUserPrefsRaw(userId);
  // Backfill `appearance` for docs saved before it existed (default shape).
  const baseAppearance = current.appearance ?? defaultUserPrefs(userId).appearance;

  const next: UserPrefs = {
    ...current,
    theme: parsed.theme ?? current.theme,
    appearance: {
      ...baseAppearance,
      ...parsed.appearance,
      background: {
        ...baseAppearance.background,
        ...parsed.appearance?.background,
      },
    },
    timezone: parsed.timezone ?? current.timezone,
    workingHours: parsed.workingHours ?? current.workingHours,
    ai: { ...current.ai, ...parsed.ai },
  };

  return db.userPrefs.upsert(
    (p) => p._id === userId,
    () => defaultUserPrefs(userId),
    next,
    { _id: userId },
  );
}
