import { ok, fail, handler } from "@/lib/api";
import { deleteNote } from "@/lib/services/notes";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const done = await deleteNote(id);
  if (!done) return fail("Note not found", 404);
  return ok({ deleted: true });
});
