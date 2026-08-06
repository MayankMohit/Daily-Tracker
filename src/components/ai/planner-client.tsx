"use client";

// Day Planner (plan §3.5): collect any one-off requirements for the day, then
// ask Gemini to time-block them alongside today's recurring tasks. The result is
// rendered as a vertical timeline.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client";
import type { DailyPlan } from "@/lib/types";

interface Item {
  description: string;
  estimatedDuration?: number;
}

// Fields styled locally rather than via the shared `inputClass` so widths behave
// inside these flex rows (`cn` has no tailwind-merge, so w-* can't be layered).
const fieldBase =
  "h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:outline-none focus:border-foreground/40 focus-visible:border-foreground/40";

export function PlannerClient({
  date,
  initialPlan,
  initialWake,
  initialSleep,
}: {
  date: string;
  initialPlan: DailyPlan | null;
  initialWake: string;
  initialSleep: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [desc, setDesc] = useState("");
  const [mins, setMins] = useState("");
  const [plan, setPlan] = useState<DailyPlan | null>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Planner hours: the window the AI schedules within (persisted as the user's
  // `workingHours` pref). Saved on blur so tweaking a time doesn't spam the API.
  const [wake, setWake] = useState(initialWake);
  const [sleep, setSleep] = useState(initialSleep);
  const [hoursStatus, setHoursStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );

  const totalMinutes = useMemo(
    () =>
      plan?.blocks.reduce(
        (sum, b) => sum + (minutesBetween(b.start, b.end) ?? 0),
        0,
      ) ?? 0,
    [plan],
  );

  async function saveHours() {
    try {
      await api.patch("/api/prefs", { workingHours: { wake, sleep } });
      setHoursStatus("saved");
      setTimeout(() => setHoursStatus("idle"), 1500);
    } catch {
      setHoursStatus("error");
    }
  }

  function addItem() {
    const d = desc.trim();
    if (!d) return;
    const m = parseInt(mins, 10);
    setItems((prev) => [
      ...prev,
      {
        description: d,
        estimatedDuration: Number.isFinite(m) && m > 0 ? m : undefined,
      },
    ]);
    setDesc("");
    setMins("");
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<DailyPlan>("/api/ai/plan", { date, items });
      setPlan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build a plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-6">
      {/* ── Inputs ─────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-5 p-4 sm:p-5">
        <div>
          <h3 className="text-sm font-semibold">Add to today</h3>
          <p className="mt-0.5 text-xs text-muted">
            Your recurring tasks are included automatically — add anything one-off
            you need to fit in.
          </p>
        </div>

        <div className="flex items-stretch gap-2">
          <input
            className={cn(fieldBase, "min-w-0 flex-1")}
            placeholder="e.g. Dentist appointment"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <div className="relative shrink-0">
            <input
              className={cn(fieldBase, "w-[92px] pr-9 text-center tabular-nums")}
              placeholder="30"
              inputMode="numeric"
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">
              min
            </span>
          </div>
          <button
            type="button"
            onClick={addItem}
            disabled={!desc.trim()}
            aria-label="Add requirement"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <PlusIcon />
          </button>
        </div>

        {items.length > 0 ? (
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li
                key={i}
                className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="flex-1 truncate text-sm">{it.description}</span>
                {it.estimatedDuration ? (
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] tabular-nums text-muted">
                    {it.estimatedDuration}m
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  aria-label="Remove"
                  className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted">
            Nothing extra yet — the planner will still schedule your recurring
            tasks.
          </p>
        )}

        {/* Planner hours */}
        <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/30 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <ClockIcon />
              Planner hours
            </span>
            <span className="text-xs">
              {hoursStatus === "saved" && (
                <span className="text-success">Saved</span>
              )}
              {hoursStatus === "error" && (
                <span className="text-danger">Couldn’t save</span>
              )}
            </span>
          </div>
          <p className="text-xs text-muted">
            The window the AI schedules your day within.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="time"
              aria-label="Day starts"
              className={cn(fieldBase, "min-w-0 flex-1 tabular-nums")}
              value={wake}
              onChange={(e) => setWake(e.target.value)}
              onBlur={saveHours}
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="time"
              aria-label="Day ends"
              className={cn(fieldBase, "min-w-0 flex-1 tabular-nums")}
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
              onBlur={saveHours}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Spinner />
              Planning your day…
            </>
          ) : (
            <>
              <SparkIcon />
              {plan ? "Regenerate plan" : "Generate plan"}
            </>
          )}
        </button>
        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      {/* ── Schedule ───────────────────────────────────────────── */}
      <Card className="flex min-h-[420px] flex-col p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Suggested schedule</h3>
          {plan && plan.blocks.length > 0 && (
            <span className="text-xs text-muted">
              {plan.blocks.length}{" "}
              {plan.blocks.length === 1 ? "block" : "blocks"}
              {totalMinutes > 0 && ` · ${fmtDuration(totalMinutes)} planned`}
            </span>
          )}
        </div>

        {loading ? (
          <TimelineSkeleton />
        ) : plan && plan.blocks.length > 0 ? (
          <>
            <ol className="flex-1">
              {plan.blocks.map((b, i) => {
                const dur = minutesBetween(b.start, b.end);
                const last = i === plan.blocks.length - 1;
                return (
                  <li key={i} className="flex gap-2 sm:gap-3">
                    <div className="flex w-14 shrink-0 flex-col items-end pt-1.5 text-right sm:w-17.5">
                      <span className="text-sm font-semibold tabular-nums">
                        {to12h(b.start)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted">
                        {to12h(b.end)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="mt-2 h-2.5 w-2.5 rounded-full border-2 border-accent bg-surface" />
                      {!last && <span className="w-px flex-1 bg-border" />}
                    </div>
                    <div
                      className={cn(
                        "flex-1 rounded-lg border border-border bg-surface-2/40 px-3 py-2",
                        last ? "mb-0" : "mb-3",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{b.item}</span>
                        {dur != null && (
                          <span className="mt-0.5 shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] tabular-nums text-muted">
                            {fmtDuration(dur)}
                          </span>
                        )}
                      </div>
                      {b.note && (
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          {b.note}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {plan.generatedAt && (
              <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted">
                Generated {new Date(plan.generatedAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <CalendarIcon />
            <p className="mt-3 text-sm font-medium">No plan yet</p>
            <p className="mt-1 max-w-[240px] text-xs text-muted">
              Add anything one-off, set your hours, and generate a time-blocked
              schedule for the day.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── time helpers ─────────────────────────────────────────────── */

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Minutes from start→end, rolling over midnight for late blocks. */
function minutesBetween(start: string, end: string): number | null {
  const a = parseHm(start);
  const b = parseHm(end);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d < 0) d += 24 * 60;
  return d;
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** "14:30" → "2:30 PM". Leaves anything unparseable untouched. */
function to12h(hhmm: string): string {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!parts) return hhmm;
  let h = parseInt(parts[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${parts[2]} ${ap}`;
}

/* ── bits ─────────────────────────────────────────────────────── */

function TimelineSkeleton() {
  return (
    <div className="flex-1 space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-2 sm:gap-3">
          <div className="h-9 w-14 shrink-0 animate-pulse rounded bg-surface-2 sm:w-17.5" />
          <div className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div
            className="h-11 flex-1 animate-pulse rounded-lg bg-surface-2"
            style={{ opacity: 1 - i * 0.15 }}
          />
        </div>
      ))}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 text-muted"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2} />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-9 w-9 text-muted/50"
      fill="none"
      aria-hidden
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth={1.75}
      />
      <path
        d="M3 9h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
        fill="currentColor"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={4}
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}
