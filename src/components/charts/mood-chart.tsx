"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { MoodPoint } from "@/lib/services/analytics";
import { monthDayLabel } from "@/lib/date";
import { MOODS } from "@/lib/moods";

// Mood over time (plan §6). 1–5 scale; gaps are connected so the trend reads
// clearly even with missing days.

export function MoodChart({ points }: { points: MoodPoint[] }) {
  const data = points.map((p) => ({
    date: monthDayLabel(p.date),
    mood: p.mood ?? null,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            interval="preserveStartEnd"
            minTickGap={20}
            stroke="var(--border)"
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
            stroke="var(--border)"
            width={36}
            tickFormatter={(v) => MOODS[v - 1]?.emoji ?? ""}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            formatter={(v) => {
              const m = Number(v);
              return [
                `${MOODS[m - 1]?.emoji ?? ""} ${MOODS[m - 1]?.label ?? ""}`,
                "Mood",
              ];
            }}
          />
          <Line
            type="monotone"
            dataKey="mood"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--accent)" }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
