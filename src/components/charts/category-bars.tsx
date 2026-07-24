// Activity-by-category breakdown (plan §3.4): blends tracked tasks and ad-hoc
// extra activities. Simple CSS bars — server-renderable, no chart lib needed.

import type { CategoryTime } from "@/lib/services/analytics";

export function CategoryBars({ data }: { data: CategoryTime[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No activity logged yet.</p>;
  }
  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.category} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-medium">{d.category}</span>
            <span className="text-muted">
              {d.count} {d.count === 1 ? "entry" : "entries"}
              {d.minutes > 0 && ` · ${d.minutes}m`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(d.count / maxCount) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
