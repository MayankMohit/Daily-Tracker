import { PageHeader, Card, EmptyState } from "@/components/ui";
import { NewTaskButton } from "@/components/new-task-button";
import { TaskProgressChart } from "@/components/charts/task-progress-chart";
import { MoodChart } from "@/components/charts/mood-chart";
import { CompletionHeatmap } from "@/components/charts/completion-heatmap";
import { CategoryBars } from "@/components/charts/category-bars";
import { listTasks } from "@/lib/services/tasks";
import {
  getTaskSeries,
  getMoodSeries,
  getDailyCompletion,
  getCategoryBreakdown,
  getMoodProductivity,
  type TaskSeries,
} from "@/lib/services/analytics";
import { aiConfigured, getCachedSummary } from "@/lib/services/ai";
import { AiSummaryCard } from "@/components/ai/ai-summary-card";
import { auth } from "@clerk/nextjs/server";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const WINDOW = 30;

export default async function InsightsPage() {
  await auth.protect();

  const tasks = await listTasks();

  if (tasks.length === 0) {
    return (
      <div>
        <PageHeader title="Insights" description="Trends across the last 30 days." />
        <EmptyState
          title="No data to chart yet"
          description="Create a task and log a few days — your progress graphs, mood trend, and completion heatmap will appear here."
          action={<NewTaskButton />}
        />
      </div>
    );
  }

  const [series, mood, completion, categories, moodProd] = await Promise.all([
    Promise.all(tasks.map((t) => getTaskSeries(t._id, WINDOW))),
    getMoodSeries(WINDOW),
    getDailyCompletion(WINDOW),
    getCategoryBreakdown(WINDOW),
    getMoodProductivity(WINDOW),
  ]);

  const taskSeries = series.filter((s): s is TaskSeries => s !== null);
  const avgRate =
    completion.filter((c) => c.applicable > 0).reduce((s, c) => s + c.rate, 0) /
    Math.max(1, completion.filter((c) => c.applicable > 0).length);

  const [cachedDaily, cachedWeekly] = aiConfigured
    ? await Promise.all([getCachedSummary("daily"), getCachedSummary("weekly")])
    : [null, null];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Trends across the last 30 days."
      />

      {aiConfigured && (
        <AiSummaryCard initial={{ daily: cachedDaily, weekly: cachedWeekly }} />
      )}

      {/* Rollup + headline stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-medium">Completion heatmap</h3>
          <CompletionHeatmap data={completion} />
        </Card>
        <div className="grid gap-4">
          <Stat
            label="Avg. completion"
            value={`${Math.round(avgRate * 100)}%`}
            hint="across days with tasks"
          />
          <MoodProductivityCard data={moodProd} />
        </div>
      </div>

      {/* Mood + categories */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="text-sm font-medium">Mood trend</h3>
          <MoodChart points={mood} />
        </Card>
        <Card className="space-y-3">
          <h3 className="text-sm font-medium">Activity by category</h3>
          <CategoryBars data={categories} />
        </Card>
      </div>

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
              <TaskProgressChart series={s} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

function MoodProductivityCard({
  data,
}: {
  data: import("@/lib/services/analytics").MoodProductivity;
}) {
  let body: React.ReactNode;
  if (data.lowMoodRate !== null && data.highMoodRate !== null) {
    const delta = Math.round((data.highMoodRate - data.lowMoodRate) * 100);
    body = (
      <p className="mt-1 text-sm">
        Completion is{" "}
        <span className="font-semibold text-accent">
          {Math.abs(delta)}% {delta >= 0 ? "higher" : "lower"}
        </span>{" "}
        on good-mood days than low-mood days.
      </p>
    );
  } else if (data.correlation !== null) {
    body = (
      <p className="mt-1 text-sm">
        Mood↔completion correlation:{" "}
        <span className="font-semibold tabular-nums">
          {data.correlation.toFixed(2)}
        </span>
      </p>
    );
  } else {
    body = (
      <p className="mt-1 text-sm text-muted">
        Log mood on more days to surface a correlation.
      </p>
    );
  }
  return (
    <Card>
      <div className="text-xs text-muted">Mood &amp; productivity</div>
      {body}
    </Card>
  );
}
