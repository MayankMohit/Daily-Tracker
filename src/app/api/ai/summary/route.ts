import { z } from "zod";
import { ok, fail, handler } from "@/lib/api";
import { generateSummary, getCachedSummary, AiError } from "@/lib/services/ai";

const bodySchema = z.object({
  type: z.enum(["daily", "weekly"]).default("daily"),
  force: z.boolean().optional(),
});

export const GET = handler(async (req: Request) => {
  const type =
    new URL(req.url).searchParams.get("type") === "weekly" ? "weekly" : "daily";
  return ok(await getCachedSummary(type));
});

export const POST = handler(async (req: Request) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("Validation failed", 422, parsed.error.flatten());
  try {
    const insight = await generateSummary(parsed.data.type, {
      force: parsed.data.force,
    });
    return ok(insight);
  } catch (e) {
    if (e instanceof AiError) return fail(e.message, e.status);
    throw e;
  }
});
