import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

// Served at /sitemap.xml. Only the public entry points belong here — the rest of
// the app is authenticated, personal-data routes that are noindex + disallowed.

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/sign-in`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/sign-up`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
