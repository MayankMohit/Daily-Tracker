// Shared helpers for route handlers: JSON parsing with Zod validation and
// consistent success/error envelopes.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
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
      return await fn(...args);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected server error";
      return fail(message, 500);
    }
  };
}
