// Clerk auth proxy (Next.js 16 renamed `middleware` → `proxy`).
//
// Attaches the Clerk session to every app + API route and gates access here at
// the edge, before any page component runs. Doing it in the proxy (rather than
// calling `auth.protect()` inside a page) means protection happens after Clerk
// has finished processing the sign-in/OAuth handshake, so the two never race.
//
// Unauthenticated requests are redirected to the app's OWN `/sign-in` page
// (see src/app/sign-in). We pass `unauthenticatedUrl` explicitly so the
// redirect always stays on this domain instead of bouncing to the hosted
// Account Portal on the accounts.* subdomain — that cross-subdomain hop is what
// caused the sign-in reload loop, because the session cookie set on the portal
// domain couldn't be verified back on the app domain.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes that don't require authentication.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/__clerk(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
    });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
