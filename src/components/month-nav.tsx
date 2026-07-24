// Compact month pager, sized to sit inline in the table's "Task" header cell.
// Plain links that set the `?month=YYYY-MM` query param the dashboard reads.
// Paging past the current month is disabled (no future data); on an earlier
// month the label itself links back to the current month.

import Link from "next/link";
import { cn } from "@/lib/cn";
import { monthLabel, monthLabelShort, shiftMonth, type MonthKey } from "@/lib/date";

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

export function MonthNav({
  viewMonth,
  isCurrent,
}: {
  viewMonth: MonthKey;
  isCurrent: boolean;
}) {
  const prev = shiftMonth(viewMonth, -1);
  const next = shiftMonth(viewMonth, 1);

  return (
    <div className="flex items-center gap-1 normal-case">
      <Link
        href={`/?month=${prev}`}
        aria-label={`Previous month (${monthLabel(prev)})`}
        title={monthLabel(prev)}
        className={arrowClass}
      >
        <Chevron dir="left" />
      </Link>

      {isCurrent ? (
        <span className="min-w-[4.75rem] text-center text-xs font-semibold tabular-nums text-foreground">
          {monthLabelShort(viewMonth)}
        </span>
      ) : (
        <Link
          href="/"
          title="Jump to current month"
          className="min-w-[4.75rem] text-center text-xs font-semibold tabular-nums text-accent hover:underline"
        >
          {monthLabelShort(viewMonth)}
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
          href={`/?month=${next}`}
          aria-label={`Next month (${monthLabel(next)})`}
          title={monthLabel(next)}
          className={arrowClass}
        >
          <Chevron dir="right" />
        </Link>
      )}
    </div>
  );
}
