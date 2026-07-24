"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { TaskSeries } from "@/lib/services/analytics";
import { monthDayLabel } from "@/lib/date";

// Per-task progress over time (plan §3). Plots the UNCAPPED percentage so
// overachievement (e.g. 133%) stays visible instead of flattening at 100 — the
// whole point of storing rawPercentage separately (§2.1). The 100% goal line is
// drawn for reference.

export function TaskProgressChart({ series }: { series: TaskSeries }) {
  const color = series.task.color ?? "var(--accent)";
  const data = series.points.map((p) => ({
    date: monthDayLabel(p.date),
    value: p.raw ?? p.percentage ?? null,
    actual: p.actual,
  }));

  const max = Math.max(
    100,
    ...data.map((d) => (typeof d.value === "number" ? d.value : 0)),
  );

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            interval="preserveStartEnd"
            minTickGap={20}
            stroke="var(--border)"
          />
          <YAxis
            domain={[0, Math.ceil(max / 25) * 25]}
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            stroke="var(--border)"
            width={40}
            tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={100} stroke="var(--success)" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            formatter={(value, _name, item) => {
              const actual = (item?.payload as { actual?: number })?.actual;
              const suffix =
                actual !== undefined && series.unit
                  ? ` (${actual} ${series.unit})`
                  : "";
              return [`${Math.round(Number(value))}%${suffix}`, "Progress"];
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2, fill: color }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
