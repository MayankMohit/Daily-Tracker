// Shared helpers for route handlers: JSON parsing with Zod validation and
// consistent success/error envelopes.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { checkRate, RateLimitError } from "@/lib/rate-limit";
import { DatabaseUnavailableError } from "@/lib/store/errors";

// General per-user burst cap applied to every API route (AI routes add their own
// per-minute + daily caps on top). Tunable via env for tighter/looser policies.
const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT || 60);
const API_RATE_WINDOW_MS = Number(process.env.API_RATE_WINDOW_MS || 10_000);

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  message: string,
  status = 400,
  details?: unknown,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    { ok: false, error: message, details },
    { status, headers },
  );
}

/** Parse+validate a JSON request body, returning either data or a 400 response. */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S>; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { data: null, error: fail("Invalid JSON body") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      data: null,
      error: fail("Validation failed", 422, result.error.flatten()),
    };
  }
  return { data: result.data, error: null };
}

/**
 * Wrap a route handler so that it (1) requires a signed-in user and (2) turns
 * thrown errors into clean 500s instead of crashing. The auth check lives here
 * rather than in the proxy so protection follows the resource, not a path
 * matcher — every API route flows through this wrapper.
 */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      const { userId } = await auth();
      if (!userId) return fail("Unauthorized", 401);
      // Per-user burst throttle across all API routes.
      checkRate(`api:${userId}`, API_RATE_LIMIT, API_RATE_WINDOW_MS);
      return await fn(...args);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return fail(err.message, 429, undefined, {
          "Retry-After": String(err.retryAfter),
        });
      }
      // Database unreachable — a transient 503, not a code bug.
      if (err instanceof DatabaseUnavailableError) {
        return fail(err.message, 503);
      }
      const message =
        err instanceof Error ? err.message : "Unexpected server error";
      return fail(message, 500);
    }
  };
}
