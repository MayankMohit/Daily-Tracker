// App-wide constants and single-user configuration.
//
// Auth is deferred (plan §9 decision): we run as a single fixed user for now.
// Every collection is still keyed by `userId`, so swapping in Clerk later is a
// matter of replacing CURRENT_USER_ID with the authenticated user's id.

export const CURRENT_USER_ID = "local-user";

export const APP_NAME = "Daily Tracker";

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
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];
