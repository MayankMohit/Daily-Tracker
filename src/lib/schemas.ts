// Zod schemas shared between client forms and API route handlers (plan §4).
// Validating in one place keeps the create-task form and the API in lockstep and
// gives us clean parse/validate for the future Gemini auto-create fallback (§3.2).

import { z } from "zod";

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm")
  .nullable();

export const unitValueSchema = z.object({
  type: z.enum(["preset", "custom"]),
  value: z.string().min(1).max(24),
});

export const reminderSchema = z.object({
  time: timeStr,
  days: z.array(z.number().int().min(0).max(6)).default([]),
});

export const percentageConfigSchema = z
  .object({
    mode: z.enum(["quantity", "direct"]),
    unit: unitValueSchema.optional(),
    targetValue: z.number().positive().optional(),
  })
  .refine(
    (c) => c.mode !== "quantity" || (c.unit !== undefined && c.targetValue !== undefined),
    { message: "Quantity mode requires a unit and a target value" },
  );

// Bare object shape (no cross-field refinements). Kept separate so partial
// patches can be derived from it — Zod's `.partial()` can't be applied to a
// refined schema (a ZodEffects). The refinements live on `taskInputSchema`.
export const taskInputObjectSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  type: z.enum(["boolean", "percentage"]),
  goal: z.enum(["build", "avoid"]).default("build"),
  percentageConfig: percentageConfigSchema.optional(),
  category: z.string().max(40).optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  estimatedDuration: z.number().int().positive().max(1440).optional(),
  recurrence: z.enum(["daily", "weekdays", "custom", "one-off"]).default("daily"),
  recurrenceDays: z.array(z.number().int().min(0).max(6)).optional(),
  startDate: dayKey.optional(),
  endDate: dayKey.optional(),
  reminder: reminderSchema.optional(),
  color: z.string().optional(),
  active: z.boolean().default(true),
});

/** Input schema for creating/updating a task (no server-managed fields). */
export const taskInputSchema = taskInputObjectSchema
  .refine((t) => t.type !== "percentage" || t.percentageConfig !== undefined, {
    message: "Percentage tasks need a percentage configuration",
    path: ["percentageConfig"],
  })
  .refine((t) => t.goal !== "avoid" || t.type === "boolean", {
    message: "Avoid tasks are tracked as a simple daily yes/no",
    path: ["type"],
  })
  .refine((t) => t.recurrence !== "custom" || (t.recurrenceDays?.length ?? 0) > 0, {
    message: "Pick at least one day for a custom recurrence",
    path: ["recurrenceDays"],
  });

/** Partial variant for PATCH bodies — validates field shapes only; the merged
 *  result is re-checked against the full `taskInputSchema` in the service. */
export const taskInputPatchSchema = taskInputObjectSchema.partial();

export type TaskInput = z.infer<typeof taskInputSchema>;

/** Log a value for a (task, date). The API resolves capped/raw percentages. */
export const taskLogInputSchema = z.object({
  taskId: z.string().min(1),
  date: dayKey,
  boolStatus: z.boolean().optional(),
  actualValue: z.number().min(0).optional(),
  directPercentage: z.number().min(0).max(100).optional(),
  /** true clears any logged value for the day. */
  clear: z.boolean().optional(),
});

export type TaskLogInput = z.infer<typeof taskLogInputSchema>;

export const moodInputSchema = z.object({
  date: dayKey,
  mood: z.number().int().min(1).max(5),
  note: z.string().max(500).optional().or(z.literal("")),
});

export type MoodInput = z.infer<typeof moodInputSchema>;

// Journal entries are end-to-end encrypted client-side: the server stores and
// validates only opaque ciphertext + IV, never plaintext.
export const journalInputSchema = z.object({
  date: dayKey,
  cipher: z.string().min(1).max(60000),
  iv: z.string().min(1).max(64),
});

export type JournalInput = z.infer<typeof journalInputSchema>;

/** A user's journal key envelope (all non-secret). Used for both first-time
 *  setup and passphrase changes — the latter just re-wraps the same data key. */
export const journalKeySetupSchema = z.object({
  salt: z.string().min(1).max(128),
  wrappedDek: z.string().min(1).max(1024),
  wrappedDekIv: z.string().min(1).max(64),
});

export type JournalKeySetup = z.infer<typeof journalKeySetupSchema>;

export const extraActivityInputSchema = z.object({
  date: dayKey,
  description: z.string().min(1, "Say what you did").max(300),
  estimatedDuration: z.number().int().positive().max(1440).optional(),
  category: z.string().max(40).optional().or(z.literal("")),
});

export type ExtraActivityInput = z.infer<typeof extraActivityInputSchema>;

export const userPrefsInputSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  timezone: z.string().optional(),
  workingHours: z
    .object({ wake: z.string(), sleep: z.string() })
    .optional(),
  ai: z
    .object({
      frequency: z.enum(["daily", "daily+weekly", "off"]),
      tone: z.enum(["encouraging", "neutral", "blunt"]),
      journalInformedByDefault: z.boolean(),
      moodCorrelation: z.boolean(),
      extraActivityAutoTag: z.boolean(),
    })
    .partial()
    .optional(),
});

export type UserPrefsInput = z.infer<typeof userPrefsInputSchema>;
