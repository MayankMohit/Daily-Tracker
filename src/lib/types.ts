// Domain types for the Daily Task Manager.
// These mirror the MongoDB collections described in plan.md §5, but are
// storage-agnostic so we can back them with a local JSON store now and swap in
// Mongoose later without touching the UI.

export type TaskType = "boolean" | "percentage";
/**
 * Whether the task is about *doing* something ("build" — the default) or
 * *not* doing something ("avoid", e.g. quit smoking, no doomscrolling). Avoid
 * tasks are always boolean: a checked day means "stayed clean / resisted",
 * which counts as a success just like a completed build task.
 */
export type TaskGoal = "build" | "avoid";
export type PercentageMode = "quantity" | "direct";
export type Priority = "low" | "medium" | "high";
export type Recurrence = "daily" | "weekdays" | "custom" | "one-off";

/** A unit for a quantity-based percentage task, e.g. { type: "preset", value: "L" }. */
export interface UnitValue {
  type: "preset" | "custom";
  value: string;
}

export interface PercentageConfig {
  mode: PercentageMode;
  /** Only for mode = "quantity". */
  unit?: UnitValue;
  /** Only for mode = "quantity". */
  targetValue?: number;
}

export interface Reminder {
  /** "HH:mm" 24h local time, or null for no reminder. */
  time: string | null;
  /** Days of week the reminder repeats on: 0 = Sunday … 6 = Saturday. */
  days: number[];
}

export interface AiMeta {
  lastAnalyzedAt?: string;
  trend?: "up" | "down" | "flat";
  notes?: string;
}

export interface Task {
  _id: string;
  userId: string;
  title: string;
  description?: string;
  type: TaskType;
  /** "build" (do it) or "avoid" (quit/abstain). Avoid tasks are always boolean. */
  goal: TaskGoal;
  /** Present only when type = "percentage". */
  percentageConfig?: PercentageConfig;
  category?: string;
  priority: Priority;
  /** Minutes; optional, required only for the Day Planner. */
  estimatedDuration?: number;
  recurrence: Recurrence;
  /** Days of week (0-6) when recurrence = "custom". */
  recurrenceDays?: number[];
  /** ISO date strings (YYYY-MM-DD). */
  startDate?: string;
  endDate?: string;
  reminder?: Reminder;
  /** Hex color for quick visual scanning in the table. */
  color?: string;
  active: boolean;
  /** Manual row position in the dashboard table; lower = higher up. Unset for
   *  tasks never reordered — those fall to the bottom, ordered by createdAt. */
  sortOrder?: number;
  createdAt: string;
  aiMeta?: AiMeta;
}

export type TaskLogKind = "boolean" | "direct_percentage" | "quantity";

export interface TaskLogValue {
  kind: TaskLogKind;
  /** kind = "boolean". */
  boolStatus?: boolean;
  /** kind = "boolean". An explicit "I failed this" mark (rendered as ✗). Purely
   *  visual — analytics/streaks score it identically to an untracked day (it has
   *  no `boolStatus`/`percentage`), but unlike an empty day the log is kept so the
   *  ✗ persists. Lets the user distinguish "failed" from "not done yet". */
  failed?: boolean;
  /** Capped 0-100. Present for percentage kinds; used for progress bars / cell color. */
  percentage?: number;
  /** Uncapped (e.g. 133). quantity mode only — preserves overachievement for graphs. */
  rawPercentage?: number;
  /** Raw amount entered by the user. quantity mode only. */
  actualValue?: number;
  /** Target as of this day. quantity mode only — snapshotted so past days stay correct. */
  targetValueSnapshot?: number;
  /** Unit as of this day. quantity mode only. */
  unitSnapshot?: string;
}

/** One doc per (task, date). The real source of truth for the table and graphs. */
export interface TaskLog {
  _id: string;
  userId: string;
  taskId: string;
  /** YYYY-MM-DD in the user's timezone. */
  date: string;
  value: TaskLogValue;
  completedAt?: string;
}

export interface MoodLog {
  _id: string;
  userId: string;
  date: string;
  /** 1 (low) – 5 (high). */
  mood: number;
  note?: string;
}

export interface JournalEntry {
  _id: string;
  userId: string;
  date: string;
  /** AES-GCM ciphertext (base64) of the entry. The server never sees plaintext. */
  cipher?: string;
  /** AES-GCM IV (base64) for `cipher`. */
  iv?: string;
  /** Legacy plaintext from before end-to-end encryption; re-encrypted (and
   *  cleared) the next time the user unlocks their journal. */
  text?: string;
  /** @deprecated Journals are end-to-end encrypted; AI never reads them. */
  allowAiRead?: boolean;
  moodRef?: string;
  updatedAt: string;
}

/** Per-user journal key envelope (all non-secret). The passphrase-derived key
 *  never leaves the browser; the server only holds the salt and the wrapped data
 *  key. Unwrapping it (client-side) both yields the entry key and proves the
 *  passphrase — none of these fields can reveal the passphrase or any entry. */
export interface JournalKeyDoc {
  _id: string; // userId
  userId: string;
  /** PBKDF2 salt (base64) for the key-encryption key. */
  salt: string;
  /** The data key, encrypted (wrapped) with the passphrase-derived key (base64). */
  wrappedDek: string;
  /** AES-GCM IV (base64) for `wrappedDek`. */
  wrappedDekIv: string;
  createdAt: string;
  /** Set when the passphrase is changed (the DEK is re-wrapped, entries unchanged). */
  updatedAt?: string;
}

export interface ExtraActivity {
  _id: string;
  userId: string;
  date: string;
  description: string;
  estimatedDuration?: number;
  category?: string;
  createdAt: string;
}

/** A free-form note. Standalone (kept on the /notes page) when `taskId` is
 *  absent, or attached to a task when set. The body is lightweight markdown —
 *  bullets (`- `), checklists (`- [ ]` / `- [x]`), `**bold**`, `*italic*`, and
 *  `# headings` — rendered by a small local parser (no editor dependency). */
export interface Note {
  _id: string;
  userId: string;
  /** When set, the note belongs to this task; otherwise it's standalone. */
  taskId?: string;
  title?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** A user's app-lock PIN (an optional privacy layer on top of Clerk auth). The
 *  PIN itself is never stored — only a scrypt hash + its salt, server-side. The
 *  mere existence of this doc means the lock is enabled; only a derived
 *  `{ enabled }` boolean is ever exposed to the client, never these fields. */
export interface PinLockDoc {
  _id: string; // userId
  userId: string;
  /** scrypt(pin, salt) as hex. */
  hash: string;
  /** Random per-user salt (hex) for `hash`. */
  salt: string;
  /** scrypt(recoveryCode, resetSalt) as hex. Lets the user reset a forgotten PIN
   *  by proving a code they saved at enable time — the raw code is never stored.
   *  Optional so PINs created before this feature keep working (backfilled on the
   *  next setPin/regenerate). */
  resetHash?: string;
  /** Random per-user salt (hex) for `resetHash`. */
  resetSalt?: string;
  updatedAt: string;
}

/** A user-uploaded background photo, stored in Vercel Blob. The `pathname` is
 *  kept so the object can be deleted from Blob when the user removes it. Capped
 *  per user (see MAX_BACKGROUND_IMAGES). */
export interface BackgroundImage {
  _id: string;
  userId: string;
  /** Public Blob URL — what the background CSS points at (via the optimizer). */
  url: string;
  /** Blob object pathname (`backgrounds/<userId>/<id>.<ext>`), used for deletes. */
  pathname: string;
  createdAt: string;
}

export interface DailyPlanRequest {
  _id: string;
  userId: string;
  date: string;
  items: { description: string; estimatedDuration?: number }[];
}

export interface DailyPlan {
  _id: string;
  userId: string;
  date: string;
  blocks: { start: string; end: string; item: string; note?: string }[];
  generatedAt: string;
}

export interface AiInsight {
  _id: string;
  userId: string;
  type: "daily" | "weekly";
  date: string;
  summary: string;
  recommendations: string[];
}

export interface ReminderDoc {
  _id: string;
  userId: string;
  taskId?: string;
  message: string;
  /** ISO timestamp (UTC). */
  fireAt: string;
  sent: boolean;
}

export interface PushSubscriptionDoc {
  _id: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export interface AiUsageCounter {
  _id: string;
  scope: "global" | string; // "global" or a userId
  date: string;
  callsMade: number;
  callsByFeature: Record<string, number>;
}

export type AiTone = "encouraging" | "neutral" | "blunt";
export type ThemeChoice = "light" | "dark" | "system";

// UI customization layered on top of the light/dark `theme` (all expressed as
// `data-*` attributes / CSS vars on <html>, so they compose with the mode).
export type PaletteChoice = "default" | "slate" | "warm" | "forest" | "rose";
export type AccentChoice =
  | "mono"
  | "blue"
  | "violet"
  | "green"
  | "amber"
  | "rose";
export type CornerChoice = "sharp" | "rounded" | "round";
export type DensityChoice = "compact" | "comfortable" | "cozy";

export interface Appearance {
  palette: PaletteChoice;
  accent: AccentChoice;
  corners: CornerChoice;
  density: DensityChoice;
  /** Background scenery. `preset` "none" = solid theme background; `overlay` is
   *  0..1, how strongly the theme colour scrims over the pattern (readability). */
  background: { preset: string; overlay: number };
}

export interface UserPrefs {
  _id: string; // userId
  userId: string;
  theme: ThemeChoice;
  appearance: Appearance;
  /** App-lock auto-lock delay in ms — how long the tab can be hidden before the
   *  PIN gate re-locks. One of the fixed stops in `lib/pin-lock`. */
  autoLockMs: number;
  timezone: string;
  /** Day Planner window, e.g. { wake: "07:00", sleep: "23:00" }. */
  workingHours: { wake: string; sleep: string };
  ai: {
    tone: AiTone;
  };
}
