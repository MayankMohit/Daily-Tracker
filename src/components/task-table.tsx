"use client";

// The main dashboard table (plan §6): tasks as rows, dates as columns, sticky
// first column + header. Cells switch on task type — checkbox (boolean),
// quantity input vs a target (quantity %), or a 0–100 input (direct %).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task, TaskLog, TaskLogValue } from "@/lib/types";
import { api } from "@/lib/client";
import { logKey } from "@/lib/keys";
import { taskAppliesOn } from "@/lib/recurrence";
import {
  weekdayLabel,
  monthDayLabel,
  dayNumberLabel,
  dayOfWeek,
  isToday,
  type DayKey,
} from "@/lib/date";
import { cn } from "@/lib/cn";
import { TaskRowMenu } from "./task-row-menu";

export function TaskTable({
  tasks,
  dates,
  initialLogs,
}: {
  tasks: Task[];
  dates: DayKey[];
  initialLogs: TaskLog[];
}) {
  const router = useRouter();
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
      router.refresh();
    }
  }, [router]);

  // Rounded outline around the current-day column. The non-today date columns
  // flex to fill width, so today's x-offset isn't a fixed value — we measure the
  // live cell and render one absolute overlay over the full column height.
  const tableRef = useRef<HTMLTableElement>(null);
  const todayCellRef = useRef<HTMLTableCellElement>(null);
  const [todayBox, setTodayBox] = useState<{
    left: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    const measure = () => {
      const table = tableRef.current;
      const cell = todayCellRef.current;
      if (!table || !cell) {
        setTodayBox(null);
        return;
      }
      const t = table.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      setTodayBox({ left: c.left - t.left, width: c.width, height: t.height });
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
      body: { boolStatus?: boolean; actualValue?: number; directPercentage?: number; clear?: boolean },
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
            <col key={d} className={isToday(d) ? "w-[80px]" : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-20 border-r border-border bg-surface px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              Task
            </th>
            <th
              className="border-r border-border px-1 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted leading-tight"
              title="Estimated duration in minutes"
            >
              Est.
              <span className="block font-normal normal-case">(min.)</span>
            </th>
            {dates.map((d) => {
              const today = isToday(d);
              const dow = dayOfWeek(d);
              const weekend = dow === 0 || dow === 6;
              return (
                <th
                  key={d}
                  ref={today ? todayCellRef : undefined}
                  className={cn(
                    "px-0 py-1.5 text-center align-middle font-medium leading-tight",
                    today
                      ? "bg-foreground/[0.04]"
                      : weekend
                        ? "bg-surface-2/50"
                        : "",
                  )}
                >
                  <div
                    className={cn(
                      "text-[10px] uppercase",
                      today ? "text-foreground" : "text-muted",
                    )}
                  >
                    {weekdayLabel(d)}
                  </div>
                  <div
                    className={cn(
                      "mx-auto grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums text-foreground",
                      today && "font-semibold",
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
          {order.map((task) => (
            <tr
              key={task._id}
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
                      onChanged={() => router.refresh()}
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
                const today = isToday(d);
                const dow = dayOfWeek(d);
                const weekend = dow === 0 || dow === 6;
                return (
                  <td
                    key={d}
                    onMouseEnter={
                      applies
                        ? (e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            showTipLater({
                              ...buildTip(task, d, value, today),
                              x: r.left + r.width / 2,
                              y: r.top,
                            });
                          }
                        : undefined
                    }
                    onMouseLeave={applies ? hideTip : undefined}
                    className={cn(
                      "px-0 py-1.5 text-center align-middle",
                      today
                        ? "bg-foreground/[0.04]"
                        : weekend
                          ? "bg-surface-2/20"
                          : "",
                    )}
                  >
                    {!applies ? (
                      <span className="text-border">·</span>
                    ) : today ? (
                      // Only today is editable; past/future days are read-only.
                      <TaskCell
                        task={task}
                        value={value}
                        onCommit={(body) => commit(task._id, d, body)}
                      />
                    ) : (
                      <ReadonlyCell task={task} value={value} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
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
    </div>
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
    status =
      task.goal === "avoid"
        ? done
          ? "Stayed clean"
          : "Slipped"
        : done
          ? "Completed"
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

// Static display of a logged value for any day other than today. Editing is
// intentionally limited to the current date (see the table body above).
function ReadonlyCell({ task, value }: { task: Task; value?: TaskLogValue }) {
  if (task.type === "boolean") {
    const done = value?.boolStatus ?? false;
    return done ? (
      <span className="mx-auto grid h-7 w-7 place-items-center">
        <CheckMark className="h-4 w-4 text-white" />
      </span>
    ) : (
      <span className="text-border">·</span>
    );
  }

  if (!value) return <span className="text-border">·</span>;
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
    actualValue?: number;
    directPercentage?: number;
    clear?: boolean;
  }) => void;
}) {
  if (task.type === "boolean") {
    const done = value?.boolStatus ?? false;
    const avoid = task.goal === "avoid";
    // For both goals a checked day is a success; only the framing differs.
    const label = avoid
      ? done
        ? "Stayed clean — tap to mark a slip"
        : "Mark that you stayed clean today"
      : done
        ? "Mark not done"
        : "Mark done";
    return (
      <button
        type="button"
        onClick={() => onCommit({ boolStatus: !done })}
        aria-label={label}
        title={label}
        className={cn(
          "mx-auto grid h-7 w-7 place-items-center rounded-md border transition-colors",
          done
            ? "border-transparent text-white"
            : "border-border/70 text-transparent hover:border-muted hover:text-muted",
        )}
      >
        <CheckMark className="h-4 w-4" />
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
      className="h-8 w-full rounded-md border-2 border-border bg-surface px-1 text-center text-sm tabular-nums focus-visible:border-accent focus-visible:outline-none"
    />
  );
}
