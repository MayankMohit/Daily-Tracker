import { Card, EmptyState } from "@/components/ui";
import { NewTaskButton } from "@/components/new-task-button";
import { TaskProgressChart } from "@/components/charts/task-progress-chart";
import { HabitChart } from "@/components/charts/habit-chart";
import { listTasks } from "@/lib/services/tasks";
import { getTaskSeries, type TaskSeries } from "@/lib/services/analytics";
import { aiConfigured, getCachedSummary } from "@/lib/services/ai";
import { AiSummaryCard } from "@/components/ai/ai-summary-card";
import { auth } from "@clerk/nextjs/server";
import { getEffectiveToday } from "@/lib/active-day";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const WINDOW = 30;

export default async function InsightsPage() {
  await auth.protect();

  const tasks = await listTasks();

  if (tasks.length === 0) {
    return (
      <div>
        <EmptyState
          title="No data to chart yet"
          description="Create a task and log a few days — your per-task progress and AI reflections will appear here."
          action={<NewTaskButton />}
        />
      </div>
    );
  }

  const today = await getEffectiveToday();
  const series = await Promise.all(
    tasks.map((t) => getTaskSeries(t._id, WINDOW, undefined, today)),
  );
  const taskSeries = series.filter((s): s is TaskSeries => s !== null);

  const [cachedDaily, cachedWeekly] = aiConfigured
    ? await Promise.all([getCachedSummary("daily"), getCachedSummary("weekly")])
    : [null, null];

  return (
    <div className="space-y-6">
      {aiConfigured && (
        <AiSummaryCard initial={{ daily: cachedDaily, weekly: cachedWeekly }} />
      )}

      {/* Per-task progress */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Progress by task</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {taskSeries.map((s) => (
            <Card key={s.task._id} className="space-y-3">
              <div className="flex items-center gap-2">
                {s.task.color && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.task.color }}
                  />
                )}
                <h3 className="text-sm font-medium">{s.task.title}</h3>
                {s.unit && (
                  <span className="text-xs text-muted">
                    target {s.task.percentageConfig?.targetValue} {s.unit}
                  </span>
                )}
              </div>
              {/* A line makes sense only for measurable progress; yes/no habits
                  get a habit grid + streak stats instead. */}
              {s.task.type === "boolean" ? (
                <HabitChart series={s} />
              ) : (
                <TaskProgressChart series={s} />
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
