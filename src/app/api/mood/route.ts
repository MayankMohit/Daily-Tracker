import { ok, parseBody, handler } from "@/lib/api";
import { moodInputSchema } from "@/lib/schemas";
import { setMood } from "@/lib/services/daily";

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, moodInputSchema);
  if (error) return error;
  const mood = await setMood(data);
  return ok(mood);
});
