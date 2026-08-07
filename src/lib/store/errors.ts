// Normalized store error for when the database can't be reached.
//
// Raw Mongoose connectivity errors (e.g. MongooseServerSelectionError) carry
// nested class instances (TopologyDescription, Map) on `reason`/`cause`. Those
// aren't plain objects, so if such an error escapes a Server Component, Server
// Action, or API route, React's Flight serializer throws a confusing "Only plain
// objects can be passed to Client Components" error instead of the real cause.
//
// The store adapter catches connectivity failures and rethrows this clean, plain
// Error subclass, so every layer above sees one friendly message it can surface.

export class DatabaseUnavailableError extends Error {
  constructor(
    message = "Couldn't reach the database. Please try again in a moment.",
  ) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

/** Whether `err` looks like a database connectivity/availability failure (as
 *  opposed to a genuine application error like a validation or not-found). */
export function isConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name ?? "";
  const message = (err as { message?: string }).message ?? "";
  return (
    /Mongo(?:ose)?(?:Server)?(?:Selection|Network|Timeout)Error/i.test(name) ||
    /server selection timed out|buffering timed out|failed to connect|topology (?:was )?destroyed|connection (?:pool )?(?:closed|timed out)|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(
      message,
    )
  );
}
