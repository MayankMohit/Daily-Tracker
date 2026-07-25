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

import { clerkMiddleware } from "@clerk/nextjs/server";

// Public routes that don't require authentication. Matched by hand rather than
// via Clerk's `createRouteMatcher` helper, which is deprecated in favour of
// resource-based checks — but we keep protection at the proxy so it runs before
// any page renders (avoiding a race with the sign-in handshake).
// SEO / PWA metadata files must be reachable by crawlers and social scrapers
// without a session. The matcher below already lets `.webmanifest` through, but
// robots/sitemap (.txt/.xml) and the extensionless OG image routes are still
// matched, so list them here to skip auth.protect() and return 200.
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/__clerk",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/opengraph-image",
  "/twitter-image",
];
const isPublicRoute = (pathname: string) =>
  PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req.nextUrl.pathname)) {
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
