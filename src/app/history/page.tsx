import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth";
import { HistoryCalendar } from "@/components/history-calendar";
import { listTasks } from "@/lib/services/tasks";
import { getLogsInRange } from "@/lib/services/logs";
import {
  getMoodsInRange,
  getJournalsInRange,
  getExtraActivitiesInRange,
  getJournalKey,
} from "@/lib/services/daily";
import { monthDays, monthKey, monthKeyToDate, dayKeyToDate } from "@/lib/date";
import { getEffectiveToday } from "@/lib/active-day";

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  await auth.protect();
  const userId = await resolveUserId();

  const today = await getEffectiveToday();
  const currentMonth = monthKey(dayKeyToDate(today));

  // Which month is being viewed (`?month=YYYY-MM`), never past the current one.
  const { month } = await searchParams;
  const requested = Array.isArray(month) ? month[0] : month;
  let viewMonth =
    (requested && monthKeyToDate(requested) && requested) || currentMonth;
  if (viewMonth > currentMonth) viewMonth = currentMonth;

  const dates = monthDays(monthKeyToDate(viewMonth)!);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [tasks, logs, moods, journals, extras, keyDoc] = await Promise.all([
    listTasks(userId),
    getLogsInRange(from, to, userId),
    getMoodsInRange(from, to, userId),
    getJournalsInRange(from, to, userId),
    getExtraActivitiesInRange(from, to, userId),
    getJournalKey(userId),
  ]);

  // Only the non-secret key envelope reaches the client; journals arrive as
  // ciphertext and are decrypted in the browser once unlocked.
  const crypto =
    keyDoc && keyDoc.wrappedDek && keyDoc.wrappedDekIv
      ? {
          salt: keyDoc.salt,
          wrappedDek: keyDoc.wrappedDek,
          wrappedDekIv: keyDoc.wrappedDekIv,
        }
      : null;

  const journalCells = journals.map((j) => ({
    date: j.date,
    cipher: j.cipher,
    iv: j.iv,
    text: j.text,
  }));

  return (
    <HistoryCalendar
      key={viewMonth}
      month={viewMonth}
      currentMonth={currentMonth}
      today={today}
      tasks={tasks}
      logs={logs}
      moods={moods}
      journals={journalCells}
      extras={extras}
      crypto={crypto}
      userKey={userId}
    />
  );
}
