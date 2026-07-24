// Clerk auth proxy (Next.js 16 renamed `middleware` → `proxy`).
//
// Attaches the Clerk session to every app + API route so `auth()` works in
// Server Components and Route Handlers. It does NOT gate access here — auth is
// enforced at each resource instead (pages call `auth.protect()`, API routes
// check `auth()` in the shared `handler` wrapper). This resource-based approach
// replaces the deprecated `createRouteMatcher` path-matching, which could
// diverge from how Next.js actually routes requests.

import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on everything except Next internals and static file extensions…
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // …always run on API routes…
    "/(api|trpc)(.*)",
    // …and on Clerk's auto-proxy path.
    "/__clerk/:path*",
  ],
};
