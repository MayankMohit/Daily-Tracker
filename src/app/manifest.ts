import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/config";

// Web App Manifest (plan §5). Served at /manifest.webmanifest by Next.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — daily task manager`,
    short_name: APP_NAME,
    description:
      "A minimal, table-based daily task manager with mood tracking, journaling, and insights.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0e",
    theme_color: "#4f46e5",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
