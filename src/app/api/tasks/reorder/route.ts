import { z } from "zod";
import { ok, parseBody, handler } from "@/lib/api";
import { reorderTasks } from "@/lib/services/tasks";

// A literal `reorder` segment — Next.js matches this before the sibling
// `[id]` dynamic route, so POST /api/tasks/reorder lands here, not on [id].
const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, reorderSchema);
  if (error) return error;
  const tasks = await reorderTasks(data.ids);
  return ok(tasks);
});
