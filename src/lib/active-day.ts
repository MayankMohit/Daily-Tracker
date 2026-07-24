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
// Timezone note: like `todayKey`, the day boundary and the 6 PM cutoff are
// computed in the server's local time (that's UTC on Vercel). This mirrors the
// rest of the app; making it timezone-aware is a separate, app-wide change.

import { addDays } from "date-fns";
import { cookies } from "next/headers";
import { toDayKey, type DayKey } from "./date";

export const ACTIVE_DAY_COOKIE = "activeDay";
/** After this hour (24h, local), the app advances to the real day on its own. */
export const AUTO_ADVANCE_HOUR = 18; // 6 PM

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActiveDayState {
  /** The day the app treats as "today" (may lag behind `real`). */
  effective: DayKey;
  /** The actual calendar day. */
  real: DayKey;
  /** True when `effective` is behind `real` — i.e. show "Proceed to next date". */
  held: boolean;
}

/** Pure resolver — kept side-effect-free so pages and the Server Action agree. */
export function computeActiveDay(
  cookieVal: string | null | undefined,
  now: Date = new Date(),
): ActiveDayState {
  const real = toDayKey(now);
  const yesterday = toDayKey(addDays(now, -1));
  const held = cookieVal && DAY_KEY_RE.test(cookieVal) ? cookieVal : null;

  let effective: DayKey;
  if (!held || held >= real) {
    // No choice yet, or already current — just be today.
    effective = real;
  } else if (now.getHours() >= AUTO_ADVANCE_HOUR) {
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

/** Resolve the active day from the request's cookie (read-only; safe in RSC). */
export async function getActiveDay(): Promise<ActiveDayState> {
  const jar = await cookies();
  return computeActiveDay(jar.get(ACTIVE_DAY_COOKIE)?.value);
}

/** Convenience: just the effective "today" for a page. */
export async function getEffectiveToday(): Promise<DayKey> {
  return (await getActiveDay()).effective;
}
