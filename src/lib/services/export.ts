// Data export (plan §6, §7): CSV and JSON of task/mood/journal/extra-activity
// history, date-range filterable. JSON is a full structured dump; CSV is a
// unified long-format event log (one row per logged thing) that opens cleanly in
// a spreadsheet.

import { db } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import type { DayKey } from "@/lib/date";
import type {
  Task,
  TaskLog,
  MoodLog,
  JournalEntry,
  ExtraActivity,
} from "@/lib/types";

export interface ExportBundle {
  from: DayKey;
  to: DayKey;
  exportedAt: string;
  tasks: Task[];
  taskLogs: TaskLog[];
  moodLogs: MoodLog[];
  journalEntries: JournalEntry[];
  extraActivities: ExtraActivity[];
}

export async function getExportBundle(
  from: DayKey,
  to: DayKey,
  userId?: string,
): Promise<ExportBundle> {
  userId ??= await resolveUserId();
  const inRange = (d: DayKey) => d >= from && d <= to;
  const [tasks, taskLogs, moodLogs, journalEntries, extraActivities] =
    await Promise.all([
      db.tasks.find((t) => t.userId === userId),
      db.taskLogs.find((l) => l.userId === userId && inRange(l.date)),
      db.moodLogs.find((m) => m.userId === userId && inRange(m.date)),
      db.journalEntries.find((j) => j.userId === userId && inRange(j.date)),
      db.extraActivities.find((e) => e.userId === userId && inRange(e.date)),
    ]);

  return {
    from,
    to,
    exportedAt: new Date().toISOString(),
    tasks,
    taskLogs,
    moodLogs,
    journalEntries,
    extraActivities,
  };
}

export function toJson(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  // Quote if it contains comma, quote, or newline; escape embedded quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function toCsv(bundle: ExportBundle): string {
  const taskTitle = new Map(bundle.tasks.map((t) => [t._id, t.title]));
  const header = ["date", "kind", "title", "value", "detail"];
  const rows: string[] = [csvRow(header)];

  for (const l of bundle.taskLogs) {
    const v = l.value;
    let value: string;
    let detail = "";
    if (v.kind === "boolean") {
      value = v.boolStatus ? "done" : "not done";
    } else if (v.kind === "quantity") {
      value = `${v.actualValue ?? ""} ${v.unitSnapshot ?? ""}`.trim();
      detail = `${v.percentage ?? 0}% (raw ${v.rawPercentage ?? v.percentage ?? 0}%), target ${v.targetValueSnapshot ?? ""}`;
    } else {
      value = `${v.percentage ?? 0}%`;
    }
    rows.push(
      csvRow([l.date, "task", taskTitle.get(l.taskId) ?? l.taskId, value, detail]),
    );
  }
  for (const m of bundle.moodLogs) {
    rows.push(csvRow([m.date, "mood", "", m.mood, m.note ?? ""]));
  }
  for (const j of bundle.journalEntries) {
    // Journals are end-to-end encrypted; the server can't decrypt them for a
    // server-side export. Legacy plaintext (not yet re-encrypted) still exports.
    const body = j.text && j.text.trim() ? j.text : "[encrypted]";
    rows.push(csvRow([j.date, "journal", "", body, ""]));
  }
  for (const e of bundle.extraActivities) {
    rows.push(
      csvRow([
        e.date,
        "extra",
        e.description,
        e.estimatedDuration ? `${e.estimatedDuration}m` : "",
        e.category ?? "",
      ]),
    );
  }

  return rows.join("\n");
}
