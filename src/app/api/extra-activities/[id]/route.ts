import { ok, fail, handler } from "@/lib/api";
import { deleteExtraActivity } from "@/lib/services/daily";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const done = await deleteExtraActivity(id);
  if (!done) return fail("Activity not found", 404);
  return ok({ deleted: true });
});
