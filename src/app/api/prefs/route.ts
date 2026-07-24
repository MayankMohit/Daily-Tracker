import { ok, parseBody, handler } from "@/lib/api";
import { userPrefsInputSchema } from "@/lib/schemas";
import { getUserPrefs, saveUserPrefs } from "@/lib/services/prefs";

export const GET = handler(async () => {
  return ok(await getUserPrefs());
});

export const PATCH = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, userPrefsInputSchema);
  if (error) return error;
  return ok(await saveUserPrefs(data));
});
