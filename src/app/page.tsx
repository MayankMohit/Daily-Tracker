import { EmptyState } from "@/components/ui";
import { NewTaskButton } from "@/components/new-task-button";
import { TaskTable } from "@/components/task-table";
import { MonthNav } from "@/components/month-nav";
import { WeekNav } from "@/components/week-nav";
import { DashboardRangeToggle } from "@/components/dashboard-range-toggle";
import { AiQuickAdd } from "@/components/ai/ai-quick-add";
import { aiConfigured } from "@/lib/services/ai";
import { listTasks } from "@/lib/services/tasks";
import { getLogsInRange } from "@/lib/services/logs";
import { noteCountsByTask } from "@/lib/services/notes";
import { getUserPrefs } from "@/lib/services/prefs";
import {
  getExtraActivities,
  getExtraActivitiesInRange,
  getMoodsInRange,
} from "@/lib/services/daily";
import {
  monthDays,
  monthKey,
  monthKeyToDate,
  dayKeyToDate,
  weekStartKey,
  weekDaysFrom,
  type DayKey,
} from "@/lib/date";
import { getEffectiveToday } from "@/lib/active-day";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

// Always render fresh — the file store changes as the user logs values.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string | string[];
    week?: string | string[];
  }>;
}) {
  const [today, prefs] = await Promise.all([
    getEffectiveToday(),
    getUserPrefs(),
  ]);
  const range = prefs.dashboardRange;
  const params = await searchParams;

  // Resolve the visible window (a set of day-keys) + its inline pager. In "week"
  // mode we page by calendar week (`?week=<any day>`, normalised to Monday);
  // otherwise by month (`?month=YYYY-MM`). Neither can page past the present.
  let dates: DayKey[];
  let isCurrentPeriod: boolean;
  let periodKey: string;
  let nav: ReactNode;

  if (range === "week") {
    const currentWeek = weekStartKey(today);
    const requested = Array.isArray(params.week) ? params.week[0] : params.week;
    let weekStart =
      requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
        ? weekStartKey(requested)
        : currentWeek;
    if (weekStart > currentWeek) weekStart = currentWeek; // no future weeks
    isCurrentPeriod = weekStart === currentWeek;
    dates = weekDaysFrom(weekStart);
    periodKey = weekStart;
    nav = <WeekNav weekStart={weekStart} isCurrent={isCurrentPeriod} />;
  } else {
    const currentMonth = monthKey(dayKeyToDate(today));
    const requested = Array.isArray(params.month)
      ? params.month[0]
      : params.month;
    let viewMonth =
      (requested && monthKeyToDate(requested) && requested) || currentMonth;
    if (viewMonth > currentMonth) viewMonth = currentMonth;
    isCurrentPeriod = viewMonth === currentMonth;
    dates = monthDays(monthKeyToDate(viewMonth)!);
    periodKey = viewMonth;
    nav = <MonthNav viewMonth={viewMonth} isCurrent={isCurrentPeriod} />;
  }

  const from = dates[0];
  const to = dates[dates.length - 1];

  const [tasks, logs, extras, rangeExtras, moods, noteCounts] = await Promise.all([
    listTasks(),
    getLogsInRange(from, to),
    getExtraActivities(today),
    getExtraActivitiesInRange(from, to),
    getMoodsInRange(from, to),
    noteCountsByTask(),
  ]);

  const categories = Array.from(
    new Set(tasks.map((t) => t.category).filter(Boolean) as string[]),
  ).sort();

  const weekView = range === "week";

  return (
    // Week mode has far fewer columns, so narrow the whole dashboard on wide
    // desktops (≥1440, centered) for a tighter, less-stretched layout. Full width
    // below that (incl. tablet / iPad Pro, which force the compact week format via
    // the client) and in month mode.
    <div
      className={cn(
        "space-y-4",
        weekView && "min-[1440px]:mx-auto min-[1440px]:w-[64%]",
      )}
    >
      {aiConfigured ? (
        <AiQuickAdd
          categories={categories}
          action={
            <NewTaskButton
              categories={categories}
              className="h-9 w-full px-4 sm:w-auto"
            />
          }
        />
      ) : (
        <div className="flex justify-end">
          <NewTaskButton categories={categories} className="h-9 px-4" />
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create your first task — a daily checkbox, or a percentage goal like “drink 3 L water”."
          action={<NewTaskButton categories={categories} />}
        />
      ) : (
        // Remount on window change so the table re-seeds its log/extras state
        // from the new range's props (useState initializers run once). Also keyed
        // on the effective day so the day-rollover control's refresh re-seeds
        // today's editable column, extras, and mood onto the new day.
        <TaskTable
          key={`${range}:${periodKey}:${today}`}
          tasks={tasks}
          dates={dates}
          initialLogs={logs}
          // Today's cell/extras only make sense in the window that contains today;
          // past months/weeks are read-only history.
          initialExtras={isCurrentPeriod ? extras : []}
          monthExtras={rangeExtras}
          initialMoods={moods}
          noteCounts={noteCounts}
          categories={categories}
          today={isCurrentPeriod ? today : undefined}
          weekView={weekView}
          periodNav={
            <div key="period-nav" className="flex items-center gap-2">
              {nav}
              <DashboardRangeToggle range={range} />
            </div>
          }
        />
      )}
    </div>
  );
}
