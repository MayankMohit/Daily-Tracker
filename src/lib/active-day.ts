// Manual day rollover.
//
// The app's notion of "today" doesn't have to flip at midnight. If you're still
// writing when the clock passes 12, the app keeps you on the previous day (its
// journal and task logs stay editable) until you explicitly press "Proceed to
// next date" — or until a hard cutoff at 6 PM, after which it advances on its
// own so you don't get stuck on a stale day.
//
// The chosen day is a per-device cookie ("activeDay"). Pages READ it (via
// `getActiveDay`) to resolve the effective day; a Server Action WRITES it (see
// src/app/actions/active-day.ts) — cookies can't be set during render.
//
// The day boundary and the 6 PM cutoff are computed in the user's configured
// timezone (Settings → timezone), via Intl, so they line up with the user's
// actual clock regardless of where the server runs.

import { cache } from "react";
import { addDays } from "date-fns";
import { cookies } from "next/headers";
import { resolveUserId } from "./auth";
import { getUserPrefs } from "./store/db";
import { DEFAULT_TIMEZONE } from "./config";
import { toDayKey, dayKeyToDate, type DayKey } from "./date";

export const ACTIVE_DAY_COOKIE = "activeDay";
/** After this hour (24h, user's local time), the app advances on its own. */
export const AUTO_ADVANCE_HOUR = 18; // 6 PM

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActiveDayState {
  /** The day the app treats as "today" (may lag behind `real`). */
  effective: DayKey;
  /** The actual calendar day, in the user's timezone. */
  real: DayKey;
  /** True when `effective` is behind `real` — i.e. show "Proceed to next date". */
  held: boolean;
}

/** The current day-key and hour (0–23) in a given IANA timezone. Falls back to
 *  the server's local time if the timezone string is invalid/unknown. */
function nowInZone(now: Date, timeZone: string): { day: DayKey; hour: number } {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(now)) parts[p.type] = p.value;
    let hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0; // some engines emit "24" at midnight
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour };
  } catch {
    return { day: toDayKey(now), hour: now.getHours() };
  }
}

/** The calendar day before `day` (pure date-string arithmetic; DST-safe). */
function prevDayKey(day: DayKey): DayKey {
  return toDayKey(addDays(dayKeyToDate(day), -1));
}

/** Pure resolver — kept side-effect-free so pages and the Server Action agree. */
export function computeActiveDay(
  cookieVal: string | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): ActiveDayState {
  const { day: real, hour } = nowInZone(now, timeZone);
  const yesterday = prevDayKey(real);
  const held = cookieVal && DAY_KEY_RE.test(cookieVal) ? cookieVal : null;

  let effective: DayKey;
  if (!held || held >= real) {
    // No choice yet, or already current — just be today.
    effective = real;
  } else if (hour >= AUTO_ADVANCE_HOUR) {
    // Past the hard cutoff — advance regardless of what was held.
    effective = real;
  } else if (held === yesterday) {
    // Writing past midnight: stay on yesterday until the user advances.
    effective = held;
  } else {
    // Held day is more than a day stale — don't linger on it.
    effective = real;
  }

  return { effective, real, held: effective < real };
}

/** The signed-in user's configured timezone (defaults to UTC).
 *
 *  Resolving the user needs Clerk's `auth()`, which throws on any request the
 *  proxy matcher doesn't cover (static assets, the web manifest, etc.). The
 *  root layout renders on those too, so we degrade to the default zone rather
 *  than crash the whole render — real app routes always run the proxy, and the
 *  client's `syncActiveDay` Server Action corrects any transient fallback. */
export const getActiveTimeZone = cache(async (): Promise<string> => {
  try {
    const userId = await resolveUserId();
    const prefs = await getUserPrefs(userId);
    return prefs.timezone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
});

/** Resolve the active day from the request's cookie (read-only; safe in RSC).
 *  Cached per request: the root layout and the page both call this (the latter
 *  via getEffectiveToday), and without memoization each repeats the cookie read,
 *  Clerk auth, and prefs lookup. */
export const getActiveDay = cache(async (): Promise<ActiveDayState> => {
  const [jar, timeZone] = await Promise.all([cookies(), getActiveTimeZone()]);
  return computeActiveDay(jar.get(ACTIVE_DAY_COOKIE)?.value, timeZone);
});

/** Convenience: just the effective "today" for a page. */
export async function getEffectiveToday(): Promise<DayKey> {
  return (await getActiveDay()).effective;
}
