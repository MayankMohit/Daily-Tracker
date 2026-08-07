import { ok, fail, handler } from "@/lib/api";
import { deleteBackgroundImage } from "@/lib/services/backgrounds";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const removed = await deleteBackgroundImage(id);
  if (!removed) return fail("Image not found", 404);
  return ok({ deleted: true });
});
