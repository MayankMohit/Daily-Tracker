import { z } from "zod";
import { ok, fail, handler } from "@/lib/api";
import { generateDayPlan, getCachedPlan, AiError } from "@/lib/services/ai";
import { todayKey } from "@/lib/date";

const itemSchema = z.object({
  description: z.string().min(1).max(300),
  estimatedDuration: z.number().int().positive().max(1440).optional(),
});

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(itemSchema).max(20).default([]),
});

export const GET = handler(async (req: Request) => {
  const date = new URL(req.url).searchParams.get("date") || todayKey();
  return ok(await getCachedPlan(date));
});

export const POST = handler(async (req: Request) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("Validation failed", 422, parsed.error.flatten());
  try {
    const plan = await generateDayPlan(parsed.data.date, parsed.data.items);
    return ok(plan);
  } catch (e) {
    if (e instanceof AiError) return fail(e.message, e.status);
    throw e;
  }
});
