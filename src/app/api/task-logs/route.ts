import { ok, fail, parseBody, handler } from "@/lib/api";
import { taskLogInputSchema } from "@/lib/schemas";
import { logValue, getLogsInRange } from "@/lib/services/logs";

export const GET = handler(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return fail("`from` and `to` query params are required");
  const logs = await getLogsInRange(from, to);
  return ok(logs);
});

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, taskLogInputSchema);
  if (error) return error;
  try {
    const log = await logValue(data);
    return ok(log);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not save log");
  }
});
