import { EmptyState } from "@/components/ui";
import { NewTaskButton } from "@/components/new-task-button";
import { TaskTable } from "@/components/task-table";
import { ExtraActivities } from "@/components/extra-activities";
import { AiQuickAdd } from "@/components/ai/ai-quick-add";
import { auth } from "@clerk/nextjs/server";
import { aiConfigured } from "@/lib/services/ai";
import { listTasks } from "@/lib/services/tasks";
import { getLogsInRange } from "@/lib/services/logs";
import { getExtraActivities } from "@/lib/services/daily";
import { monthDays, todayKey } from "@/lib/date";

// Always render fresh — the file store changes as the user logs values.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await auth.protect();

  const today = todayKey();
  const dates = monthDays();
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [tasks, logs, extras] = await Promise.all([
    listTasks(),
    getLogsInRange(from, to),
    getExtraActivities(today),
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
        <TaskTable tasks={tasks} dates={dates} initialLogs={logs} />
      )}

      <ExtraActivities date={today} initial={extras} categories={categories} />
    </div>
  );
}
