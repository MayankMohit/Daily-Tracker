"use client";

// The main dashboard table (plan §6): tasks as rows, dates as columns, sticky
// first column + header. Cells switch on task type — checkbox (boolean),
// quantity input vs a target (quantity %), or a 0–100 input (direct %).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ExtraActivity, MoodLog, Task, TaskLog, TaskLogValue } from "@/lib/types";
import { api } from "@/lib/client";
import { logKey } from "@/lib/keys";
import { taskAppliesOn } from "@/lib/recurrence";
import {
  weekdayLabel,
  monthDayLabel,
  dayNumberLabel,
  dayOfWeek,
  toDayKey,
  type DayKey,
} from "@/lib/date";
import { MOODS } from "@/lib/moods";
import { cn } from "@/lib/cn";
import { TaskRowMenu } from "./task-row-menu";
import { MonthlyTrendChart, type TrendPoint } from "./charts/monthly-trend-chart";
import { MoodTrendChart, type MoodTrendPoint } from "./charts/mood-trend-chart";
import { MoodInsight, type MoodInsightData } from "./mood-insight";

export function TaskTable({
  tasks,
  dates,
  initialLogs,
  initialExtras = [],
  monthExtras = [],
  initialMoods = [],
  categories: categoryList = [],
  today,
  monthNav,
}: {
  tasks: Task[];
  dates: DayKey[];
  initialLogs: TaskLog[];
  initialExtras?: ExtraActivity[];
  /** All of the month's extra activities, for the chart's per-day hover. The
   *  table itself still only shows today's (via `initialExtras`). */
  monthExtras?: ExtraActivity[];
  /** The viewed month's mood logs, powering the mood chart + correlation. */
  initialMoods?: MoodLog[];
  categories?: string[];
  today?: DayKey;
  /** Month pager, rendered inline in the "Task" header cell. */
  monthNav?: ReactNode;
}) {
  const router = useRouter();
  // Server re-render (after create/edit/delete/reorder) runs inside a transition
  // so the refresh is non-blocking — the UI stays interactive and shows a pending
  // state instead of freezing while the RSC payload streams back.
  const [, startTransition] = useTransition();
  const refresh = useCallback(
    () => startTransition(() => router.refresh()),
    [router],
  );
  // "Today" is the app's *effective* day (the manual day-rollover can hold it on
  // the previous date), passed in as the `today` prop — NOT the system clock.
  // Using `isToday()` here would make the wrong column editable after midnight.
  // In a past-month view `today` is undefined, so no column is current.
  const isCurrentDay = (d: DayKey) => (today ? d === today : false);
  // Distinct existing category names, offered as suggestions in the edit form.
  const categories = useMemo(
    () =>
      Array.from(
        new Set(tasks.map((t) => t.category).filter((c): c is string => !!c)),
      ).sort(),
    [tasks],
  );
  const [logs, setLogs] = useState<Map<string, TaskLogValue>>(() => {
    const m = new Map<string, TaskLogValue>();
    for (const l of initialLogs) m.set(logKey(l.taskId, l.date), l.value);
    return m;
  });

  const [extras, setExtras] = useState<ExtraActivity[]>(initialExtras);
  const [exDesc, setExDesc] = useState("");
  const [exDur, setExDur] = useState("");
  const [exCat, setExCat] = useState("");
  const [exBusy, setExBusy] = useState(false);

  async function addExtra() {
    const desc = exDesc.trim();
    if (!desc || !today) return;
    setExBusy(true);
    try {
      const created = await api.post<ExtraActivity>("/api/extra-activities", {
        date: today,
        description: desc,
        estimatedDuration: exDur ? Number(exDur) : undefined,
        category: exCat || undefined,
      });
      setExtras((xs) => [...xs, created]);
      setExDesc("");
      setExDur("");
      setExCat("");
    } finally {
      setExBusy(false);
    }
  }

  async function removeExtra(id: string) {
    const prev = extras;
    setExtras((xs) => xs.filter((x) => x._id !== id));
    try {
      await api.del(`/api/extra-activities/${id}`);
    } catch {
      setExtras(prev);
    }
  }

  // Mood, one value (1–5) per day. Only today is settable (like the log cells);
  // past days are read-only history shown on the chart. Optimistic with rollback.
  const [moods, setMoods] = useState<Map<DayKey, number>>(() => {
    const m = new Map<DayKey, number>();
    for (const x of initialMoods) m.set(x.date, x.mood);
    return m;
  });

  async function setTodayMood(mood: number) {
    if (!today) return;
    const prev = moods.get(today);
    setMoods((m) => new Map(m).set(today, mood));
    try {
      await api.post("/api/mood", { date: today, mood });
    } catch {
      setMoods((m) => {
        const next = new Map(m);
        if (prev) next.set(today, prev);
        else next.delete(today);
        return next;
      });
    }
  }

  // Hover tooltip anchored above the cell under the pointer. It only appears
  // after the pointer has rested on a cell for a beat, so a quick sweep across
  // the grid doesn't flash cards everywhere.
  const [tip, setTip] = useState<
    (ReturnType<typeof buildTip> & { x: number; y: number }) | null
  >(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTipLater = useCallback(
    (data: ReturnType<typeof buildTip> & { x: number; y: number }) => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
      tipTimer.current = setTimeout(() => setTip(data), 2000);
    },
    [],
  );
  const hideTip = useCallback(() => {
    if (tipTimer.current) {
      clearTimeout(tipTimer.current);
      tipTimer.current = null;
    }
    setTip(null);
  }, []);

  // Local row order for drag-to-reorder, seeded from the server order. When the
  // server sends a new list (add/archive/etc.) we re-sync by adjusting state
  // during render — React's recommended pattern over a setState-in-effect.
  const [order, setOrder] = useState<Task[]>(tasks);
  const [syncedFrom, setSyncedFrom] = useState(tasks);
  if (syncedFrom !== tasks) {
    setSyncedFrom(tasks);
    setOrder(tasks);
  }

  // `dragId` is the row being dragged; `handleId` gates HTML5 dragging so a row
  // is only draggable while its grip is held (keeps inputs/buttons usable).
  // `dragIdRef` mirrors dragId for use inside frequently-fired drag handlers.
  const [dragId, setDragId] = useState<string | null>(null);
  const [handleId, setHandleId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  // Reposition the dragged row just before/after the row under the cursor.
  // Driving this off the pointer's position within the hovered row (rather than
  // a plain enter/leave swap) keeps movement smooth and lets a row reach the
  // very top or bottom. Returns the same array reference when nothing moved so
  // React skips the re-render.
  const moveRelative = useCallback(
    (targetId: string, pointerBelow: boolean) => {
      const dragged = dragIdRef.current;
      if (!dragged || dragged === targetId) return;
      setOrder((list) => {
        const from = list.findIndex((t) => t._id === dragged);
        const to = list.findIndex((t) => t._id === targetId);
        if (from === -1 || to === -1 || from === to) return list;
        // Only commit the move once the pointer has crossed the target row's
        // midpoint in the direction of travel. Without this guard the dragged
        // row ping-pongs one slot back and forth on every dragover — the flicker.
        if (from < to && !pointerBelow) return list;
        if (from > to && pointerBelow) return list;
        const next = list.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    },
    [],
  );

  const persistOrder = useCallback(async () => {
    const ids = orderRef.current.map((t) => t._id);
    try {
      await api.post("/api/tasks/reorder", { ids });
    } catch {
      // Reorder didn't stick — pull the authoritative order back from the server.
      refresh();
    }
  }, [refresh]);

  // Rounded outline around the current-day column. The non-today date columns
  // flex to fill width, so today's x-offset isn't a fixed value — we measure the
  // live cell and render one absolute overlay over the full column height.
  const tableRef = useRef<HTMLTableElement>(null);
  const todayCellRef = useRef<HTMLTableCellElement>(null);
  const taskRowsEndRef = useRef<HTMLTableRowElement>(null);
  // One ref per date header cell, so the monthly chart below can align each of
  // its points to the exact centre of that day's column at any width.
  const dateCellRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const [todayBox, setTodayBox] = useState<{
    left: number;
    width: number;
    height: number;
  } | null>(null);
  // Geometry the trend chart needs, measured from the live table: total width
  // (chart matches it) plus each column centre and the plot's left/right bounds.
  const [chartGeom, setChartGeom] = useState<{
    width: number;
    plotLeft: number;
    plotRight: number;
    centers: number[];
  } | null>(null);
  useEffect(() => {
    const measure = () => {
      const table = tableRef.current;
      if (!table) {
        setTodayBox(null);
        setChartGeom(null);
        return;
      }
      const t = table.getBoundingClientRect();

      const cell = todayCellRef.current;
      if (cell) {
        const c = cell.getBoundingClientRect();
        const endRow = taskRowsEndRef.current;
        const height = endRow
          ? endRow.getBoundingClientRect().bottom - t.top
          : t.height;
        setTodayBox({ left: c.left - t.left, width: c.width, height });
      } else {
        setTodayBox(null);
      }

      const rects = dateCellRefs.current.map(
        (el) => el?.getBoundingClientRect() ?? null,
      );
      const centers = rects.map((r) => (r ? r.left - t.left + r.width / 2 : 0));
      const first = rects.find((r): r is DOMRect => r !== null);
      const last = [...rects]
        .reverse()
        .find((r): r is DOMRect => r !== null);
      setChartGeom({
        width: t.width,
        plotLeft: first ? first.left - t.left : 0,
        plotRight: last ? last.right - t.left : t.width,
        centers,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (tableRef.current) ro.observe(tableRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [order, dates]);

  const commit = useCallback(
    async (
      taskId: string,
      date: DayKey,
      body: {
        boolStatus?: boolean;
        failed?: boolean;
        actualValue?: number;
        directPercentage?: number;
        clear?: boolean;
      },
    ) => {
      const key = logKey(taskId, date);
      // Optimistic: reflect immediately, roll back on failure.
      const prev = logs.get(key);
      try {
        const log = await api.post<TaskLog | null>("/api/task-logs", {
          taskId,
          date,
          ...body,
        });
        setLogs((m) => {
          const next = new Map(m);
          if (log) next.set(key, log.value);
          else next.delete(key);
          return next;
        });
      } catch {
        setLogs((m) => {
          const next = new Map(m);
          if (prev) next.set(key, prev);
          else next.delete(key);
          return next;
        });
      }
    },
    [logs],
  );

  // Extra activities grouped by day for the chart hover. Past days come from the
  // server-loaded month; today's are taken from live state so adds/removes show
  // up immediately.
  const extrasByDate = useMemo(() => {
    const m = new Map<string, ExtraActivity[]>();
    for (const e of monthExtras) {
      if (e.date === today) continue; // today handled from live state below
      const list = m.get(e.date);
      if (list) list.push(e);
      else m.set(e.date, [e]);
    }
    if (today && extras.length) m.set(today, extras);
    return m;
  }, [monthExtras, extras, today]);

  // Per-day data for the trend chart: the overall completion (average of each
  // applicable task's contribution — boolean 0/1, percentage capped %/100) plus
  // a per-task breakdown and that day's extra activities, for the hover tooltip.
  // Recomputes live as today's cells are edited. Days with no tasks — or still
  // in the future — get a null value so the line skips them rather than dropping
  // to 0%.
  const trendPoints = useMemo<TrendPoint[]>(
    () =>
      dates.map((d, i) => {
        const future = today ? d > today : false;
        const applicable = future
          ? []
          : order.filter((t) => taskAppliesOn(t, d));
        const dayExtras = future ? [] : extrasByDate.get(d) ?? [];
        let value: number | null = null;
        let detail: TrendPoint["detail"] = null;
        if (applicable.length > 0 || dayExtras.length > 0) {
          let sum = 0;
          let completed = 0;
          const items = applicable.map((t) => {
            const v = logs.get(logKey(t._id, d));
            const c = contributionOf(t, v);
            sum += c;
            if (c >= 1) completed++;
            return { title: t.title, color: t.color, text: cellText(t, v), done: c >= 1 };
          });
          if (applicable.length > 0) value = (sum / applicable.length) * 100;
          detail = {
            completion: value ?? 0,
            applicable: applicable.length,
            completed,
            items,
            extras: dayExtras.map((e) => ({
              description: e.description,
              category: e.category,
              duration: e.estimatedDuration,
            })),
          };
        }
        return {
          x: chartGeom?.centers[i] ?? 0,
          value,
          label: monthDayLabel(d),
          weekday: weekdayLabel(d),
          future,
          detail,
        };
      }),
    [dates, order, logs, today, chartGeom, extrasByDate],
  );

  // Mood plotted on the same column grid as the completion trend.
  const moodTrendPoints = useMemo<MoodTrendPoint[]>(
    () =>
      dates.map((d, i) => ({
        x: chartGeom?.centers[i] ?? 0,
        mood: moods.get(d) ?? null,
        label: monthDayLabel(d),
        weekday: weekdayLabel(d),
        isToday: today ? d === today : false,
      })),
    [dates, moods, chartGeom, today],
  );

  // Pair each day's mood with its completion to read the mood↔productivity link.
  // Uses the completion the trend chart already computed, so it stays in lockstep
  // with live edits.
  const moodInsight = useMemo<MoodInsightData>(() => {
    const completionByDate = new Map<DayKey, number | null>();
    trendPoints.forEach((p, i) => completionByDate.set(dates[i], p.value));

    const pairs: { mood: number; rate: number }[] = [];
    for (const d of dates) {
      const mood = moods.get(d);
      const val = completionByDate.get(d);
      if (mood === undefined || val === null || val === undefined) continue;
      pairs.push({ mood, rate: val / 100 });
    }
    const avg = (xs: { rate: number }[]) =>
      xs.length ? xs.reduce((s, x) => s + x.rate, 0) / xs.length : null;

    return {
      today: today
        ? {
            mood: moods.get(today) ?? null,
            completion: completionByDate.get(today) ?? null,
          }
        : null,
      goodAvg: avg(pairs.filter((p) => p.mood >= 4)),
      lowAvg: avg(pairs.filter((p) => p.mood <= 2)),
      correlation: pearson(
        pairs.map((p) => p.mood),
        pairs.map((p) => p.rate),
      ),
      pairedDays: pairs.length,
    };
  }, [dates, moods, trendPoints, today]);

  if (tasks.length === 0) return null;

  return (
    <>
    <div
      className="overflow-x-auto rounded-xl border border-border bg-surface"
      // Accept the drop anywhere in the table while a row is being dragged, so
      // the cursor never flickers to "not allowed" over headers, gaps, or padding.
      onDragOver={(e) => {
        if (!dragIdRef.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        if (dragIdRef.current) e.preventDefault();
      }}
    >
      <div className="relative">
      <table
        ref={tableRef}
        className="w-full min-w-[1000px] table-fixed border-collapse text-sm"
      >
        <colgroup>
          <col className="w-[280px]" />
          <col className="w-[52px]" />
          {dates.map((d) => (
            <col key={d} className={isCurrentDay(d) ? "w-[80px]" : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-20 border-r border-border bg-surface px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <div className="flex items-center justify-between gap-2">
                <span>Task</span>
                {monthNav}
              </div>
            </th>
            <th
              className="border-r border-border px-1 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted leading-tight"
              title="Estimated duration in minutes"
            >
              Est.
              <span className="block font-normal normal-case">(min.)</span>
            </th>
            {dates.map((d, i) => {
              const current = isCurrentDay(d);
              const dow = dayOfWeek(d);
              const weekend = dow === 0 || dow === 6;
              return (
                <th
                  key={d}
                  ref={(el) => {
                    dateCellRefs.current[i] = el;
                    if (current) todayCellRef.current = el;
                  }}
                  className={cn(
                    "px-0 py-1.5 text-center align-middle font-medium leading-tight",
                    current
                      ? "bg-foreground/[0.04]"
                      : weekend
                        ? "bg-surface-2/50"
                        : "",
                  )}
                >
                  <div
                    className={cn(
                      "text-[10px] uppercase",
                      current ? "text-foreground" : "text-muted",
                    )}
                  >
                    {weekdayLabel(d)}
                  </div>
                  <div
                    className={cn(
                      "mx-auto grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums text-foreground",
                      current && "font-semibold",
                    )}
                  >
                    {dayNumberLabel(d)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {order.map((task, i) => (
            <tr
              key={task._id}
              ref={i === order.length - 1 ? taskRowsEndRef : undefined}
              draggable={handleId === task._id}
              onDragStart={(e) => {
                dragIdRef.current = task._id;
                setDragId(task._id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                dragIdRef.current = null;
                setDragId(null);
                setHandleId(null);
                void persistOrder();
              }}
              onDragOver={(e) => {
                // Always allow the drop so the cursor stays a steady "move"
                // instead of flickering to "not allowed".
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (!dragIdRef.current || dragIdRef.current === task._id) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pointerBelow = e.clientY > rect.top + rect.height / 2;
                moveRelative(task._id, pointerBelow);
              }}
              className={cn(
                "group border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2/40",
                dragId === task._id && "opacity-40",
              )}
            >
              <td className="sticky left-0 z-10 border-r border-border bg-surface px-4 py-2.5 align-middle transition-colors group-hover:bg-surface-2/40">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    onMouseDown={() => setHandleId(task._id)}
                    onMouseUp={() => setHandleId(null)}
                    onMouseLeave={() => setHandleId((h) => (dragId ? h : null))}
                    className="-ml-2.5 grid h-6 w-4 shrink-0 cursor-grab touch-none place-items-center text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
                  >
                    ⠿
                  </button>
                  <div className="min-w-0 flex-1">
                    <TaskRowHeader
                      task={task}
                      categories={categories}
                      onChanged={refresh}
                    />
                  </div>
                </div>
              </td>
              <td className="border-r border-border px-1 py-2.5 text-center align-middle text-xs tabular-nums text-muted">
                {task.estimatedDuration ?? <span className="text-muted/70">_</span>}
              </td>
              {dates.map((d) => {
                const applies = taskAppliesOn(task, d);
                const value = logs.get(logKey(task._id, d));
                const isCurrent = isCurrentDay(d);
                const dow = dayOfWeek(d);
                const weekend = dow === 0 || dow === 6;
                // A day is "past" relative to now. When viewing an earlier month
                // (`today` prop undefined) every day is past; in the current month
                // it's the days before today.
                const isPast = today ? d < today : true;
                // The task couldn't be missed before it existed. `createdAt` is a
                // UTC timestamp; compare on its local day (matches HabitChart).
                const existed = d >= toDayKey(new Date(task.createdAt));
                // Missed = scheduled on a past day the task already existed, with
                // nothing to show for it (boolean not done / percentage no entry).
                // A partial percentage entry is progress, not a miss.
                const missed =
                  applies &&
                  isPast &&
                  existed &&
                  !isCurrent &&
                  (task.type === "boolean" ? !value?.boolStatus : !value);
                return (
                  <td
                    key={d}
                    onMouseEnter={
                      applies
                        ? (e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            showTipLater({
                              ...buildTip(task, d, value, isCurrent),
                              x: r.left + r.width / 2,
                              y: r.top,
                            });
                          }
                        : undefined
                    }
                    onMouseLeave={applies ? hideTip : undefined}
                    className={cn(
                      "px-0 py-1.5 text-center align-middle",
                      isCurrent
                        ? "bg-foreground/[0.04]"
                        : weekend
                          ? "bg-surface-2/20"
                          : "",
                    )}
                  >
                    {!applies ? (
                      // Not scheduled this day — a bold dash (with a hover
                      // explanation) so it reads as a deliberate "off" marker, not
                      // a broken/missing input.
                      <DashMark
                        title={isCurrent ? "Not scheduled today" : "Not scheduled"}
                      />
                    ) : isCurrent ? (
                      // Only today is editable; past/future days are read-only.
                      <TaskCell
                        task={task}
                        value={value}
                        onCommit={(body) => commit(task._id, d, body)}
                      />
                    ) : (
                      <ReadonlyCell task={task} value={value} missed={missed} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {/* Extra activity rows */}
          {extras.map((ex) => (
            <tr key={ex._id} className="group border-b border-border/40 bg-surface-2/30">
              <td
                colSpan={dates.length + 2}
                className="sticky left-0 z-10 px-4 py-2 align-middle"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/70 shrink-0">
                    +did
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground/80">{ex.description}</span>
                  {ex.category && (
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted shrink-0">
                      {ex.category}
                    </span>
                  )}
                  {ex.estimatedDuration && (
                    <span className="text-[11px] text-muted tabular-nums shrink-0">{ex.estimatedDuration}m</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExtra(ex._id)}
                    aria-label="Remove"
                    className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {/* Inline "did today" add row */}
          {today && (
            <tr className="border-t border-border/60 bg-surface-2/10">
              <td colSpan={dates.length + 2} className="px-4 py-2 align-middle">
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); addExtra(); }}
                >
                  <input
                    className="h-8 flex-1 min-w-0 rounded-md border border-border bg-surface px-3 text-sm placeholder:text-muted/50 focus-visible:border-foreground/40 focus-visible:outline-none"
                    placeholder="+ What else did you do today?"
                    value={exDesc}
                    onChange={(e) => setExDesc(e.target.value)}
                  />
                  <input
                    className="h-8 w-16 shrink-0 rounded-md border border-border bg-surface px-2 text-center text-sm tabular-nums placeholder:text-muted/50 focus-visible:border-foreground/40 focus-visible:outline-none"
                    type="number"
                    min="0"
                    placeholder="min"
                    value={exDur}
                    onChange={(e) => setExDur(e.target.value)}
                  />
                  {categoryList.length > 0 && (
                    <select
                      className="h-8 w-28 shrink-0 rounded-md border border-border bg-surface px-2 text-sm text-muted focus-visible:border-foreground/40 focus-visible:outline-none"
                      value={exCat}
                      onChange={(e) => setExCat(e.target.value)}
                    >
                      <option value="">Category</option>
                      {categoryList.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="submit"
                    disabled={exBusy || !exDesc.trim()}
                    className="h-8 shrink-0 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>
              </td>
            </tr>
          )}
        </tbody>
      </table>
        {todayBox && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-20 rounded-lg"
            style={{
              left: todayBox.left,
              width: todayBox.width,
              top: 0,
              height: todayBox.height,
              border: "2.5px solid var(--foreground)",
            }}
          />
        )}
      </div>
      {/* Monthly completion trend, aligned column-for-column with the table and
          sharing its horizontal scroll on narrow screens. */}
      {chartGeom && chartGeom.width > 0 && (
        <div className="min-w-[1000px] border-t border-border">
          <div className="px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Daily completion
          </div>
          <MonthlyTrendChart
            points={trendPoints}
            width={chartGeom.width}
            plotLeft={chartGeom.plotLeft}
            plotRight={chartGeom.plotRight}
          />
        </div>
      )}
      {/* Mood, on the same column grid so it reads against the table + trend. */}
      {chartGeom && chartGeom.width > 0 && (
        <div className="min-w-[1000px] border-t border-border">
          <div className="px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Mood
          </div>
          <MoodTrendChart
            points={moodTrendPoints}
            width={chartGeom.width}
            plotLeft={chartGeom.plotLeft}
            plotRight={chartGeom.plotRight}
          />
        </div>
      )}
    </div>

    {/* Today's mood input + the read-out sit outside the scrolling table card so
        they stay in view on narrow screens. Past months are read-only (no input). */}
    {today && (
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm text-muted">How was today?</span>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setTodayMood(m.value)}
                title={m.label}
                aria-label={m.label}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors",
                  moods.get(today) === m.value
                    ? "border-accent bg-accent/10"
                    : "border-border hover:bg-surface-2",
                )}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    <MoodInsight data={moodInsight} />

    {tip && (
      <div
        aria-hidden
        className="pointer-events-none fixed z-50 w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-left shadow-lg"
        style={{ left: tip.x, top: tip.y - 8 }}
      >
        <div className="text-xs font-semibold text-foreground">{tip.title}</div>
        {tip.dateLabel && (
          <div className="mt-0.5 text-[11px] text-muted">{tip.dateLabel}</div>
        )}
        <div className="mt-1 text-xs text-foreground">{tip.status}</div>
        {tip.detail && (
          <div className="text-[11px] tabular-nums text-muted">{tip.detail}</div>
        )}
        {tip.category && (
          <div className="mt-1.5 inline-block rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
            {tip.category}
          </div>
        )}
      </div>
    )}
    </>
  );
}

// Assemble the hover-tooltip content for a single (task, date) cell. For the
// current day (`compact`) we drop the date/category chrome and keep just the
// name plus percentage and count — the day is already obvious from the column.
function buildTip(
  task: Task,
  date: DayKey,
  value?: TaskLogValue,
  compact = false,
) {
  const dateLabel = compact
    ? null
    : `${weekdayLabel(date)}, ${monthDayLabel(date)}`;
  let status: string;
  let detail: string | null = null;
  if (task.type === "boolean") {
    const done = value?.boolStatus ?? false;
    const failed = value?.failed ?? false;
    status =
      task.goal === "avoid"
        ? done
          ? "Stayed clean"
          : failed
            ? "Slipped"
            : "No entry"
        : done
          ? "Completed"
          : failed
            ? "Failed"
            : "Not completed";
  } else if (!value) {
    status = "No entry";
  } else {
    const raw = value.rawPercentage ?? value.percentage ?? 0;
    status = `${Math.round(raw)}% complete`;
    if (value.actualValue != null) {
      const target =
        value.targetValueSnapshot ?? task.percentageConfig?.targetValue;
      const unit =
        value.unitSnapshot ?? task.percentageConfig?.unit?.value ?? "";
      detail =
        target != null
          ? `${fmtNum(value.actualValue)} / ${fmtNum(target)} ${unit}`.trim()
          : `${fmtNum(value.actualValue)} ${unit}`.trim();
    }
  }
  return {
    title: task.title,
    dateLabel,
    status,
    detail,
    category: compact ? undefined : task.category,
  };
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// A single task's 0–1 contribution to a day's completion: boolean is done/not,
// percentage counts capped progress. Mirrors the server-side rollup in
// lib/services/analytics so the live chart matches the Insights numbers.
// A `failed` (✗) log has no `boolStatus`, so it scores 0 — identical to an
// untracked day (the ✗ is intentionally visual-only).
function contributionOf(task: Task, v?: TaskLogValue): number {
  if (!v) return 0;
  if (task.type === "boolean") return v.boolStatus ? 1 : 0;
  return Math.min(100, v.percentage ?? 0) / 100;
}

// Pearson correlation between two equal-length series, or null when it isn't
// meaningful (fewer than 3 pairs, or either series is constant). Mirrors the
// server-side rollup in lib/services/analytics.
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

// A short human status for one task on one day, shown in the chart's hover
// breakdown — e.g. "Done", "Stayed clean", "2.4 / 3 L · 80%", "80%".
function cellText(task: Task, v?: TaskLogValue): string {
  if (task.type === "boolean") {
    const done = v?.boolStatus ?? false;
    const failed = v?.failed ?? false;
    if (task.goal === "avoid") return done ? "Stayed clean" : failed ? "Slipped" : "No entry";
    return done ? "Done" : failed ? "Failed" : "Missed";
  }
  if (!v) return "No entry";
  const raw = v.rawPercentage ?? v.percentage ?? 0;
  if (v.actualValue != null) {
    const target = v.targetValueSnapshot ?? task.percentageConfig?.targetValue;
    const unit = v.unitSnapshot ?? task.percentageConfig?.unit?.value ?? "";
    const amount =
      target != null
        ? `${fmtNum(v.actualValue)} / ${fmtNum(target)} ${unit}`.trim()
        : `${fmtNum(v.actualValue)} ${unit}`.trim();
    return `${amount} · ${Math.round(raw)}%`;
  }
  return `${Math.round(raw)}%`;
}

// Static display of a logged value for any day other than today. Editing is
// intentionally limited to the current date (see the table body above). `missed`
// marks a scheduled day (after the task existed) that went unlogged/undone.
function ReadonlyCell({
  task,
  value,
  missed,
}: {
  task: Task;
  value?: TaskLogValue;
  missed?: boolean;
}) {
  if (task.type === "boolean") {
    const done = value?.boolStatus ?? false;
    if (done) {
      return (
        <span className="mx-auto grid h-7 w-7 place-items-center">
          <CheckMark className="h-4 w-4 text-foreground" />
        </span>
      );
    }
    // An explicit ✗ the user set — show it deliberately (same glyph as a derived
    // miss, but backed by a real log rather than inferred from absence).
    if (value?.failed) {
      return (
        <span className="mx-auto grid h-7 w-7 place-items-center text-danger">
          <CrossMark className="h-4 w-4" />
        </span>
      );
    }
    return missed ? <MissedMark /> : <span className="text-border">·</span>;
  }

  if (!value) return missed ? <MissedMark /> : <span className="text-border">·</span>;
  const pct = value.percentage ?? 0;
  const raw = value.rawPercentage ?? pct;
  return (
    <div className="mx-auto flex flex-col items-center gap-0.5">
      <MiniPie pct={pct} raw={raw} />
      <span
        className={cn(
          "text-[10px] leading-none tabular-nums",
          raw >= 100 ? "font-medium text-foreground" : "text-muted",
        )}
      >
        {Math.round(raw)}%
      </span>
    </div>
  );
}

// A small filled pie showing progress toward a percentage goal. The disc is the
// remaining share; the wedge grows clockwise from 12 o'clock — light grey while
// in progress, a brighter grey once the goal is met (no accent colour).
function MiniPie({
  pct,
  raw,
  size = 20,
}: {
  pct: number;
  raw?: number;
  size?: number;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const done = (raw ?? p) >= 100;
  const fill = done ? "#e2e8f0" : "#94a3b8";
  const r = size / 2;
  const cx = r;
  const cy = r;
  const angle = (p / 100) * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const large = p > 50 ? 1 : 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      <circle cx={cx} cy={cy} r={r} className="fill-surface-2" />
      {p >= 100 ? (
        <circle cx={cx} cy={cy} r={r} fill={fill} />
      ) : p > 0 ? (
        <path
          d={`M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x.toFixed(
            3,
          )} ${y.toFixed(3)} Z`}
          fill={fill}
        />
      ) : null}
    </svg>
  );
}

// A missed scheduled day: a bold "✕" in the danger colour (visible in both
// themes) so lapses stand out when scanning a row — no cell background needed.
function MissedMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Missed"
      className="mx-auto h-4 w-4 text-danger"
    >
      <title>Missed — scheduled but not done</title>
      <path
        d="M7 7l10 10M17 7L7 17"
        stroke="currentColor"
        strokeWidth={3.25}
        strokeLinecap="round"
      />
    </svg>
  );
}

// Not-scheduled marker: a bold dash in the muted colour, sized/weighted to stay
// clearly visible in light and dark without a cell background.
function DashMark({ title }: { title: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Not scheduled"
      className="mx-auto h-4 w-4 text-muted"
    >
      <title>{title}</title>
      <path
        d="M6 12h12"
        stroke="currentColor"
        strokeWidth={3.25}
        strokeLinecap="round"
      />
    </svg>
  );
}

// A crisp, thick check mark rendered as an SVG stroke (currentColor), so callers
// control size and colour via className.
function CheckMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A thick ✗ for an explicit "failed" mark (currentColor). Same weight/scale as
// CheckMark so the three-state cell stays visually balanced.
function CrossMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TaskRowHeader({
  task,
  categories,
  onChanged,
}: {
  task: Task;
  categories: string[];
  onChanged: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {task.color && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: task.color }}
            />
          )}
          <span className="truncate font-medium">{task.title}</span>
          {task.reminder?.time && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 shrink-0 text-muted"
              role="img"
              aria-label={`Reminder at ${task.reminder.time}`}
            >
              <title>{`Reminder at ${task.reminder.time}`}</title>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          )}
          {task.goal === "avoid" && (
            <span
              className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
              title="Avoid task — a checked day means you stayed clean"
            >
              avoid
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {task.category && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5">
              {task.category}
            </span>
          )}
          <span>{typeLabel(task)}</span>
          {task.priority === "high" && (
            <span className="text-warning">● high</span>
          )}
        </div>
      </div>
      <TaskRowMenu task={task} categories={categories} onChanged={onChanged} />
    </div>
  );
}

function typeLabel(task: Task): string {
  if (task.type === "boolean")
    return task.goal === "avoid" ? "stay clean" : "done/not";
  const cfg = task.percentageConfig!;
  if (cfg.mode === "direct") return "0–100%";
  return `${cfg.targetValue} ${cfg.unit?.value ?? ""}`.trim();
}

function TaskCell({
  task,
  value,
  onCommit,
}: {
  task: Task;
  value?: TaskLogValue;
  onCommit: (body: {
    boolStatus?: boolean;
    failed?: boolean;
    actualValue?: number;
    directPercentage?: number;
    clear?: boolean;
  }) => void;
}) {
  if (task.type === "boolean") {
    const done = value?.boolStatus ?? false;
    const failed = value?.failed ?? false;
    const avoid = task.goal === "avoid";
    // Three-state cycle: empty → done (✓) → failed (✗) → empty. `failed` is a
    // deliberate "I didn't do it" mark; it's stored but scored like an empty day.
    const next = done
      ? { failed: true } // done → failed
      : failed
        ? { clear: true } // failed → empty
        : { boolStatus: true }; // empty → done
    const label = avoid
      ? done
        ? "Stayed clean — tap to mark a slip (✗)"
        : failed
          ? "Slipped — tap to clear"
          : "Mark that you stayed clean today"
      : done
        ? "Done — tap to mark failed (✗)"
        : failed
          ? "Marked failed — tap to clear"
          : "Mark done";
    return (
      <button
        type="button"
        onClick={() => onCommit(next)}
        aria-label={label}
        title={label}
        className={cn(
          "mx-auto grid h-7 w-7 place-items-center rounded-md border transition-colors",
          done
            ? "border-transparent text-foreground"
            : failed
              ? "border-transparent text-danger"
              : "border-border/70 text-transparent hover:border-muted hover:text-muted",
        )}
      >
        {failed ? (
          <CrossMark className="h-4 w-4" />
        ) : (
          <CheckMark className="h-4 w-4" />
        )}
      </button>
    );
  }

  const cfg = task.percentageConfig!;
  const pct = value?.percentage ?? 0;
  const raw = value?.rawPercentage ?? pct;

  return (
    <div className="mx-auto flex w-full max-w-[72px] flex-col items-center gap-1">
      <QuantityInput
        mode={cfg.mode}
        current={
          cfg.mode === "quantity"
            ? value?.actualValue
            : value?.percentage
        }
        onCommit={(n) =>
          n === null
            ? onCommit({ clear: true })
            : cfg.mode === "quantity"
              ? onCommit({ actualValue: n })
              : onCommit({ directPercentage: n })
        }
      />
      <span
        className={cn(
          "text-[10px] leading-none tabular-nums",
          raw >= 100 ? "font-medium text-foreground" : "text-muted",
        )}
      >
        {Math.round(raw)}%
      </span>
    </div>
  );
}

function QuantityInput({
  mode,
  current,
  onCommit,
}: {
  mode: "quantity" | "direct";
  current?: number;
  onCommit: (n: number | null) => void;
}) {
  const [draft, setDraft] = useState<string>(
    current !== undefined ? String(current) : "",
  );

  // Keep the input in sync if the underlying value changes elsewhere.
  const shown = useMemo(
    () => (current !== undefined ? String(current) : ""),
    [current],
  );

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0) {
      setDraft(shown);
      return;
    }
    onCommit(mode === "direct" ? Math.min(100, n) : n);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step="any"
      value={draft === "" && shown !== "" ? shown : draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder={mode === "direct" ? "%" : "—"}
      className="h-8 w-full rounded-md border-2 border-border bg-surface px-1 text-center text-sm tabular-nums focus-visible:border-foreground/40 focus-visible:outline-none"
    />
  );
}
