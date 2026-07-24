import { ok, parseBody, handler } from "@/lib/api";
import { extraActivityInputSchema } from "@/lib/schemas";
import { addExtraActivity, getExtraActivities } from "@/lib/services/daily";

export const GET = handler(async (req: Request) => {
  const date = new URL(req.url).searchParams.get("date");
  const activities = date ? await getExtraActivities(date) : [];
  return ok(activities);
});

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, extraActivityInputSchema);
  if (error) return error;
  const activity = await addExtraActivity(data);
  return ok(activity, { status: 201 });
});
