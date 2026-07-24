"use server";

// Server Actions that write the active-day cookie (pages can only read it during
// render). `sync` keeps the cookie anchored to the effective day during normal
// use — so that when midnight passes, the cookie reads as "yesterday" and the
// hold kicks in. `advance` is the explicit "Proceed to next date" jump.

import { cookies } from "next/headers";
import {
  ACTIVE_DAY_COOKIE,
  computeActiveDay,
  type ActiveDayState,
} from "@/lib/active-day";
import { toDayKey } from "@/lib/date";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 3, // 3 days — outlives the overnight hold window
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

/** Persist the resolved effective day so the overnight anchor stays fresh. */
export async function syncActiveDay(): Promise<ActiveDayState> {
  const jar = await cookies();
  const state = computeActiveDay(jar.get(ACTIVE_DAY_COOKIE)?.value);
  jar.set(ACTIVE_DAY_COOKIE, state.effective, COOKIE_OPTS);
  return state;
}

/** Explicit "Proceed to next date" — move to the real calendar day now. */
export async function advanceActiveDay(): Promise<ActiveDayState> {
  const jar = await cookies();
  const real = toDayKey(new Date());
  jar.set(ACTIVE_DAY_COOKIE, real, COOKIE_OPTS);
  return { effective: real, real, held: false };
}
