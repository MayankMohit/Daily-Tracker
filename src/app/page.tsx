import { EmptyState } from "@/components/ui";
import { NewTaskButton } from "@/components/new-task-button";
import { TaskTable } from "@/components/task-table";
import { MonthNav } from "@/components/month-nav";
import { AiQuickAdd } from "@/components/ai/ai-quick-add";
import { aiConfigured } from "@/lib/services/ai";
import { listTasks } from "@/lib/services/tasks";
import { getLogsInRange } from "@/lib/services/logs";
import {
  getExtraActivities,
  getExtraActivitiesInRange,
  getMoodsInRange,
} from "@/lib/services/daily";
import { monthDays, monthKey, monthKeyToDate, dayKeyToDate } from "@/lib/date";
import { getEffectiveToday } from "@/lib/active-day";

// Always render fresh — the file store changes as the user logs values.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const today = await getEffectiveToday();
  const currentMonth = monthKey(dayKeyToDate(today));

  // Which month is being viewed (`?month=YYYY-MM`). Default to — and never page
  // beyond — the current month, since there's no future data to show.
  const { month } = await searchParams;
  const requested = Array.isArray(month) ? month[0] : month;
  let viewMonth =
    (requested && monthKeyToDate(requested) && requested) || currentMonth;
  if (viewMonth > currentMonth) viewMonth = currentMonth;
  const isCurrentMonth = viewMonth === currentMonth;

  const dates = monthDays(monthKeyToDate(viewMonth)!);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [tasks, logs, extras, monthExtras, moods] = await Promise.all([
    listTasks(),
    getLogsInRange(from, to),
    getExtraActivities(today),
    getExtraActivitiesInRange(from, to),
    getMoodsInRange(from, to),
  ]);

  const categories = Array.from(
    new Set(tasks.map((t) => t.category).filter(Boolean) as string[]),
  ).sort();

  return (
    <div className="space-y-6">
      {aiConfigured ? (
        <AiQuickAdd
          categories={categories}
          action={<NewTaskButton categories={categories} />}
        />
      ) : (
        <div className="flex justify-end">
          <NewTaskButton categories={categories} />
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create your first task — a daily checkbox, or a percentage goal like “drink 3 L water”."
          action={<NewTaskButton categories={categories} />}
        />
      ) : (
        // Remount on month change so the table re-seeds its log/extras state
        // from the new month's props (useState initializers run once).
        <TaskTable
          key={viewMonth}
          tasks={tasks}
          dates={dates}
          initialLogs={logs}
          // Today's cell/extras only make sense on the current month; past
          // months are read-only history.
          initialExtras={isCurrentMonth ? extras : []}
          monthExtras={monthExtras}
          initialMoods={moods}
          categories={categories}
          today={isCurrentMonth ? today : undefined}
          monthNav={<MonthNav viewMonth={viewMonth} isCurrent={isCurrentMonth} />}
        />
      )}
    </div>
  );
}
