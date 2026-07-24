import { ok, fail, parseBody, handler } from "@/lib/api";
import { taskInputSchema } from "@/lib/schemas";
import { createTask, listTasks } from "@/lib/services/tasks";

export const GET = handler(async (req: Request) => {
  const includeArchived =
    new URL(req.url).searchParams.get("includeArchived") === "1";
  const tasks = await listTasks(undefined, { includeArchived });
  return ok(tasks);
});

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, taskInputSchema);
  if (error) return error;
  try {
    const task = await createTask(data);
    return ok(task, { status: 201 });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not create task");
  }
});
