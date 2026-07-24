import { ok, parseBody, handler } from "@/lib/api";
import { journalInputSchema } from "@/lib/schemas";
import { setJournal } from "@/lib/services/daily";

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, journalInputSchema);
  if (error) return error;
  const entry = await setJournal(data);
  return ok(entry);
});
