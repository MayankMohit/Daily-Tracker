import { z } from "zod";
import { ok, fail, handler } from "@/lib/api";
import { parseTaskDraft, AiError } from "@/lib/services/ai";

const bodySchema = z.object({ text: z.string().min(1).max(300) });

export const POST = handler(async (req: Request) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("Describe the task in a short phrase.", 422);
  try {
    const draft = await parseTaskDraft(parsed.data.text);
    return ok(draft);
  } catch (e) {
    if (e instanceof AiError) return fail(e.message, e.status);
    throw e;
  }
});
