// Route-level loading skeletons. Each `app/**/loading.tsx` renders one of these
// inside the shared layout's <main>, so on a client navigation the destination's
// skeleton paints instantly (the layout stays mounted) while the page's dynamic
// data streams in and swaps over. Each skeleton mirrors its page's real layout —
// same container width, same column split, same card shapes — so the swap is a
// calm fill-in rather than a jarring reflow, on both desktop and mobile. Purely
// decorative — every block is aria-hidden via <Skeleton>.

import { Card, Skeleton } from "./ui";

/** Dashboard: the AI quick-add bar, the month grid, and the trend charts. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Quick-add / new-task bar */}
      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <Skeleton className="h-9 min-w-0 flex-1" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </Card>

      {/* The task table card */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {/* Header row */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-24" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-6" />
          </div>
        </div>
        {/* Task rows */}
        <div className="divide-y divide-border/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <div className="hidden gap-1.5 sm:flex">
                {Array.from({ length: 8 }).map((_, j) => (
                  <Skeleton key={j} className="h-7 w-7 rounded-md" />
                ))}
              </div>
              <Skeleton className="h-7 w-7 rounded-md sm:hidden" />
            </div>
          ))}
        </div>
        {/* Chart strip */}
        <div className="border-t border-border p-4">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Notes: a right-aligned "New note" action above a responsive grid of square
 *  note cards (1 col mobile → 2 → 3 on large screens). */
export function NotesSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="flex min-h-42 flex-col gap-2.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/** History: a two-column split — a fixed-width calendar card on the left and a
 *  wider day-recap card on the right. Stacks to one column on mobile. */
export function HistorySkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Calendar */}
        <Card className="space-y-4">
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <Skeleton className="h-7 w-7" />
              <Skeleton className="h-7 w-7" />
            </div>
            <Skeleton className="h-4 w-28" />
            <div className="flex gap-1">
              <Skeleton className="h-7 w-7" />
              <Skeleton className="h-7 w-7" />
            </div>
          </div>
          {/* Weekday header + day grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={`h${i}`} className="mx-auto h-3 w-6" />
            ))}
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-md" />
            ))}
          </div>
          <Skeleton className="h-3 w-36" />
        </Card>

        {/* Day recap */}
        <Card className="space-y-5">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          {Array.from({ length: 3 }).map((_, s) => (
            <div key={s} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                {Array.from({ length: 3 }).map((_, r) => (
                  <div key={r} className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3.5 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/** Day Planner: a two-column split — an input card on the left and a taller
 *  schedule/timeline card on the right. Stacks to one column on mobile. */
export function PlannerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-6">
      {/* Inputs */}
      <Card className="flex flex-col gap-5 p-4 sm:p-5">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-full" />
        </div>
        {/* Add row: description + minutes + add button */}
        <div className="flex items-stretch gap-2">
          <Skeleton className="h-10 min-w-0 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-23 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
        {/* Empty-items placeholder */}
        <Skeleton className="h-10 w-full rounded-lg" />
        {/* Planner hours box */}
        <div className="space-y-2.5 rounded-lg border border-border p-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-10 flex-1 rounded-lg" />
          </div>
        </div>
        {/* Generate button */}
        <Skeleton className="h-11 w-full rounded-lg" />
      </Card>

      {/* Schedule */}
      <Card className="flex min-h-105 flex-col p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="flex-1 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-2 sm:gap-3">
              <div className="flex w-14 shrink-0 flex-col items-end gap-1 pt-1.5 sm:w-17.5">
                <Skeleton className="h-3.5 w-12" />
                <Skeleton className="h-2.5 w-10" />
              </div>
              <Skeleton className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" />
              <Skeleton className="h-14 flex-1 rounded-lg" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Settings: a narrow single column of stacked cards (a taller first card, then
 *  several shorter ones). */
export function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Appearance — the tallest card */}
      <SettingsCardSkeleton rows={4} />
      {/* Preferences, PIN, archived tasks, export */}
      <SettingsCardSkeleton rows={2} />
      <SettingsCardSkeleton rows={2} />
      <SettingsCardSkeleton rows={3} />
      <SettingsCardSkeleton rows={1} />
    </div>
  );
}

function SettingsCardSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Insights: an AI-summary card on top, then a "Progress by task" heading over a
 *  two-up grid of per-task chart cards (single column on mobile). */
export function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      {/* AI summary */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-3/4" />
      </Card>

      {/* Progress by task */}
      <div>
        <Skeleton className="mb-3 h-6 w-40" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-3.5 w-32" />
              </div>
              <Skeleton className="h-28 w-full" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Journal: the full-width writing surface — date heading + status chip, a row of
 *  prompt chips and actions, the large writing area, and a footer meta line. */
export function JournalSkeleton() {
  return (
    <Card className="space-y-4">
      {/* Date heading + status chip */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
      </div>

      {/* Prompt chips + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Writing area */}
      <Skeleton className="h-72 w-full rounded-xl" />

      {/* Footer meta */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}
