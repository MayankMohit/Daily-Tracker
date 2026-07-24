import { ok, handler } from "@/lib/api";
import { aiStatus } from "@/lib/services/ai";

export const GET = handler(async () => {
  return ok(await aiStatus());
});
