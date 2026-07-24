import { ok, fail, parseBody, handler } from "@/lib/api";
import { taskInputPatchSchema } from "@/lib/schemas";
import { updateTask, archiveTask, deleteTask } from "@/lib/services/tasks";

// In Next.js 16, dynamic route `params` is a Promise and must be awaited.
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, taskInputPatchSchema);
  if (error) return error;
  const updated = await updateTask(id, data);
  if (!updated) return fail("Task not found", 404);
  return ok(updated);
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  // Default is a soft archive (keeps history); ?hard=1 permanently deletes.
  const hard = new URL(req.url).searchParams.get("hard") === "1";
  if (hard) {
    const done = await deleteTask(id);
    if (!done) return fail("Task not found", 404);
    return ok({ deleted: true });
  }
  const archived = await archiveTask(id);
  if (!archived) return fail("Task not found", 404);
  return ok(archived);
});
