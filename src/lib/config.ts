// App-wide constants and single-user configuration.
//
// Auth is deferred (plan §9 decision): we run as a single fixed user for now.
// Every collection is still keyed by `userId`, so swapping in Clerk later is a
// matter of replacing CURRENT_USER_ID with the authenticated user's id.

export const CURRENT_USER_ID = "local-user";

export const APP_NAME = "LockedIn";

/** One-line pitch used for OG/Twitter titles and structured data. */
export const APP_TAGLINE = "Daily task & habit tracker";

/** Long-form description reused across metadata, manifest, and JSON-LD. */
export const APP_DESCRIPTION =
  "LockedIn is a minimal daily task tracker with habit streaks, mood logging, private end-to-end encrypted journaling, and AI-powered insights — built to help you stay focused and consistent.";

/** SEO keywords surfaced in the root metadata. */
export const APP_KEYWORDS = [
  "daily task tracker",
  "habit tracker",
  "habit streaks",
  "productivity app",
  "mood tracker",
  "journaling app",
  "daily planner",
  "AI insights",
  "self improvement",
  "LockedIn",
];

/**
 * Canonical origin for absolute URLs (metadataBase, sitemap, robots, OG images).
 * Set `NEXT_PUBLIC_SITE_URL` in production (e.g. https://lockedin.example.com);
 * falls back to the Vercel deploy URL, then localhost for dev. Trailing slash
 * trimmed so `${SITE_URL}/path` never doubles up.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");

/** Default timezone until the user sets one; overridden client-side on first load. */
export const DEFAULT_TIMEZONE = "UTC";

export const PRIORITIES = ["low", "medium", "high"] as const;

export const RECURRENCES = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "custom", label: "Custom days" },
  { value: "one-off", label: "One-off" },
] as const;

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Preset task colors for quick visual scanning in the table. */
export const TASK_COLORS = [
  // bright spectrum (Tailwind 500s)
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  // deeper shades
  "#b91c1c", // red-700
  "#c2410c", // orange-700
  "#15803d", // green-700
  "#0f766e", // teal-700
  "#1d4ed8", // blue-700
  "#7e22ce", // purple-700
  // neutrals
  "#64748b", // slate
  "#78716c", // stone
  "#0f172a", // slate-900
];
