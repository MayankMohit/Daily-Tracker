"use server";

// Server Actions that write the active-day cookie (pages can only read it during
// render). `sync` keeps the cookie anchored to the effective day during normal
// use — so that when midnight passes, the cookie reads as "yesterday" and the
// hold kicks in. `advance` is the explicit "Proceed to next date" jump. Both
// resolve the day in the user's configured timezone via `computeActiveDay`.

import { cookies } from "next/headers";
import {
  ACTIVE_DAY_COOKIE,
  computeActiveDay,
  getActiveTimeZone,
  prevDayKey,
  type ActiveDayState,
} from "@/lib/active-day";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 3, // 3 days — outlives the overnight hold window
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

/** Persist the resolved effective day so the overnight anchor stays fresh. */
export async function syncActiveDay(): Promise<ActiveDayState> {
  const [jar, timeZone] = await Promise.all([cookies(), getActiveTimeZone()]);
  const state = computeActiveDay(jar.get(ACTIVE_DAY_COOKIE)?.value, timeZone);
  jar.set(ACTIVE_DAY_COOKIE, state.effective, COOKIE_OPTS);
  return state;
}

/** Explicit "Proceed to next date" — move to the real calendar day now. */
export async function advanceActiveDay(): Promise<ActiveDayState> {
  const [jar, timeZone] = await Promise.all([cookies(), getActiveTimeZone()]);
  const { real } = computeActiveDay(jar.get(ACTIVE_DAY_COOKIE)?.value, timeZone);
  jar.set(ACTIVE_DAY_COOKIE, real, COOKIE_OPTS);
  // Recompute against the just-written cookie so `beforeCutoff` reflects real time.
  return computeActiveDay(real, timeZone);
}

/** Explicit "Edit yesterday" — hold the app on the previous calendar day so its
 *  cells become editable. Only permitted before the 6 PM cutoff; after that the
 *  day auto-advances, so this is a no-op that just returns the current state. */
export async function editPreviousDay(): Promise<ActiveDayState> {
  const [jar, timeZone] = await Promise.all([cookies(), getActiveTimeZone()]);
  const state = computeActiveDay(jar.get(ACTIVE_DAY_COOKIE)?.value, timeZone);
  if (!state.beforeCutoff || state.held) return state;
  const prev = prevDayKey(state.real);
  jar.set(ACTIVE_DAY_COOKIE, prev, COOKIE_OPTS);
  return computeActiveDay(prev, timeZone);
}
