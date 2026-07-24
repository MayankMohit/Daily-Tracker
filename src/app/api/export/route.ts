import { fail, handler } from "@/lib/api";
import { getExportBundle, toJson, toCsv } from "@/lib/services/export";
import { todayKey, lastNDays } from "@/lib/date";

export const GET = handler(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const format = params.get("format") === "csv" ? "csv" : "json";
  const defaults = lastNDays(365);
  const from = params.get("from") || defaults[0];
  const to = params.get("to") || todayKey();

  if (from > to) return fail("`from` must be on or before `to`");

  const bundle = await getExportBundle(from, to);
  const filename = `daily-tracker_${from}_to_${to}.${format}`;
  const body = format === "csv" ? toCsv(bundle) : toJson(bundle);
  const contentType =
    format === "csv" ? "text/csv; charset=utf-8" : "application/json";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
