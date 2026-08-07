// Compact week pager, sized to sit inline in the table's "Task" header cell —
// the week-mode counterpart to MonthNav. Plain links that set the
// `?week=YYYY-MM-DD` query param (any day of the week; the page normalises it to
// that week's Monday). Paging past the current week is disabled (no future data);
// on an earlier week the label links back to the current week.

import Link from "next/link";
import { cn } from "@/lib/cn";
import { shiftWeek, weekLabel, type DayKey } from "@/lib/date";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

const arrowClass =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function WeekNav({
  weekStart,
  isCurrent,
}: {
  /** Monday day-key of the viewed week. */
  weekStart: DayKey;
  isCurrent: boolean;
}) {
  const prev = shiftWeek(weekStart, -1);
  const next = shiftWeek(weekStart, 1);
  const label = weekLabel(weekStart);

  return (
    <div className="flex items-center gap-1 normal-case">
      <Link
        href={`/?week=${prev}`}
        aria-label={`Previous week (${weekLabel(prev)})`}
        title={weekLabel(prev)}
        className={arrowClass}
      >
        <Chevron dir="left" />
      </Link>

      {isCurrent ? (
        <span className="min-w-[6.5rem] text-center text-xs font-semibold tabular-nums text-foreground">
          {label}
        </span>
      ) : (
        <Link
          href="/"
          title="Jump to this week"
          className="min-w-[6.5rem] text-center text-xs font-semibold tabular-nums text-accent hover:underline"
        >
          {label}
        </Link>
      )}

      {isCurrent ? (
        <span
          aria-disabled
          title="No future data"
          className={cn(arrowClass, "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-muted")}
        >
          <Chevron dir="right" />
        </span>
      ) : (
        <Link
          href={`/?week=${next}`}
          aria-label={`Next week (${weekLabel(next)})`}
          title={weekLabel(next)}
          className={arrowClass}
        >
          <Chevron dir="right" />
        </Link>
      )}
    </div>
  );
}
