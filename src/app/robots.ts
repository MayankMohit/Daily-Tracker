import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

// Served at /robots.txt. Public entry pages are crawlable; the API and the
// authenticated, personal-data routes are disallowed (crawlers are redirected
// to sign-in anyway, but this states intent and saves crawl budget).

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/insights",
          "/history",
          "/journal",
          "/planner",
          "/settings",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
