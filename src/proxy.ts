// Clerk auth proxy (Next.js 16 renamed `middleware` → `proxy`).
//
// Attaches the Clerk session to every app + API route so `auth()` works in
// Server Components and Route Handlers. It does NOT gate access here — auth is
// enforced at each resource instead (pages call `auth.protect()`, API routes
// check `auth()` in the shared `handler` wrapper). This resource-based approach
// replaces the deprecated `createRouteMatcher` path-matching, which could
// diverge from how Next.js actually routes requests.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes that don't require authentication.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/__clerk(.*)",
]);

// Protect all routes at the proxy level so auth.protect() in page components
// never races against the Clerk OAuth handshake completing.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
