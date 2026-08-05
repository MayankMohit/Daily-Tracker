// In-memory sliding-window rate limiter.
//
// Each key (e.g. `api:<userId>` or `ai:<userId>`) keeps the timestamps of its
// recent hits; a hit is rejected when more than `limit` fall inside the trailing
// `windowMs`. The check is synchronous, so within a single Node process it is
// race-free (JS runs it to completion before the next request is served).
//
// Scope note: the window lives in this module's process memory. On a
// multi-instance deploy each instance limits independently, so the effective cap
// scales with instance count — a hard global cap would need a shared store
// (Redis / Mongo TTL). For this app's scale, per-instance limiting is a fine,
// zero-dependency tradeoff.

/** Thrown when a caller exceeds its window. `retryAfter` is whole seconds. */
export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfter: number,
    readonly status = 429,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

type Bucket = { hits: number[]; windowMs: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

// Drop empty/expired buckets occasionally so memory stays bounded as keys
// (users) come and go. Each bucket is pruned against its own window.
function maybeSweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter((t) => t > now - b.windowMs);
    if (b.hits.length === 0) buckets.delete(key);
  }
}

/**
 * Record one hit for `key`. Throws {@link RateLimitError} when more than `limit`
 * hits have occurred within the trailing `windowMs`, without recording the
 * rejected hit. Sliding window: aged-out timestamps are pruned each call.
 */
export function checkRate(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  maybeSweep(now);

  const b = buckets.get(key) ?? { hits: [], windowMs };
  b.windowMs = windowMs;
  b.hits = b.hits.filter((t) => t > now - windowMs);

  if (b.hits.length >= limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((b.hits[0] + windowMs - now) / 1000),
    );
    buckets.set(key, b);
    throw new RateLimitError(
      `Too many requests — slow down and try again in ${retryAfter}s.`,
      retryAfter,
    );
  }

  b.hits.push(now);
  buckets.set(key, b);
}
