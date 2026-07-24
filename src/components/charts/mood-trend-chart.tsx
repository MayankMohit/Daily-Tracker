"use client";

// Monthly mood trend, drawn to line up with the task table above it — a sibling
// of MonthlyTrendChart. The table owns the column layout and hands us each date
// column's centre x (plus the plot's left/right bounds and shared width), so a
// day's mood dot sits exactly under that day's column. Five horizontal levels
// (1–5) are labelled with the mood emoji in the left gutter; hovering a day's
// vertical band opens a small tooltip.

import { useRef, useState } from "react";
import { MOODS, moodMeta } from "@/lib/moods";

export interface MoodTrendPoint {
  /** Centre x (px) of this day's column, relative to the chart's left edge. */
  x: number;
  /** 1–5 mood, or null for days with no logged mood. */
  mood: number | null;
  /** Human date label, e.g. "Jul 5". */
  label: string;
  weekday?: string;
  isToday?: boolean;
}

export function MoodTrendChart({
  points,
  width,
  plotLeft,
  plotRight,
  height = 132,
}: {
  points: MoodTrendPoint[];
  width: number;
  plotLeft: number;
  plotRight: number;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const padTop = 14;
  const padBottom = 12;
  const plotH = height - padTop - padBottom;
  // Level 5 (great) at the top, level 1 (awful) at the bottom.
  const yFor = (m: number) => padTop + (1 - (m - 1) / 4) * plotH;

  const defined = points.filter(
    (p): p is MoodTrendPoint & { mood: number } => p.mood !== null,
  );
  const path = defined
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${yFor(p.mood).toFixed(2)}`,
    )
    .join(" ");

  // Each day owns a hover band reaching halfway to its neighbours.
  const bands = points.map((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    const left = prev ? (prev.x + p.x) / 2 : plotLeft;
    const right = next ? (p.x + next.x) / 2 : plotRight;
    return { left, right: Math.max(left, right) };
  });

  const show = (i: number) => {
    const p = points[i];
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || p.mood === null) return;
    setActive(i);
    setAnchor({ x: box.left + p.x, y: box.top + yFor(p.mood) });
  };
  const hide = () => {
    setActive(null);
    setAnchor(null);
  };

  const act = active !== null ? points[active] : null;

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label="Mood over the month"
        onMouseLeave={hide}
      >
        {/* One gridline per level, with the mood emoji in the left gutter (under
            the Task/Est. columns) so it doesn't shift the plot. */}
        {MOODS.map((m) => {
          const y = yFor(m.value);
          return (
            <g key={m.value}>
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray={m.value === 1 ? undefined : "3 3"}
              />
              <text
                x={plotLeft - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={12}
              >
                {m.emoji}
              </text>
            </g>
          );
        })}

        {/* Vertical guide at the hovered day. */}
        {act && act.mood !== null && (
          <line
            x1={act.x}
            x2={act.x}
            y1={padTop}
            y2={padTop + plotH}
            stroke="var(--accent)"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        )}

        {defined.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {defined.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={yFor(p.mood)}
            r={p.isToday ? 4 : 3}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={1.5}
          />
        ))}

        {act && act.mood !== null && (
          <circle
            cx={act.x}
            cy={yFor(act.mood)}
            r={5.5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}

        {/* Transparent per-day hit areas for the wide hover targets. */}
        {points.map((p, i) =>
          p.mood !== null ? (
            <rect
              key={i}
              x={bands[i].left}
              y={0}
              width={Math.max(0, bands[i].right - bands[i].left)}
              height={height}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => show(i)}
            />
          ) : null,
        )}
      </svg>

      {act && anchor && act.mood !== null && (
        <MoodTooltip point={act} anchor={anchor} />
      )}
    </>
  );
}

function MoodTooltip({
  point,
  anchor,
}: {
  point: MoodTrendPoint;
  anchor: { x: number; y: number };
}) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const align = anchor.x < 120 ? "start" : anchor.x > vw - 120 ? "end" : "center";
  const tx = align === "center" ? "-50%" : align === "start" ? "0%" : "-100%";
  const meta = point.mood === null ? undefined : moodMeta(point.mood);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 w-max rounded-lg border border-border bg-surface-2 px-3 py-2 text-left shadow-lg"
      style={{ left: anchor.x, top: anchor.y - 12, transform: `translate(${tx}, -100%)` }}
    >
      <div className="text-xs font-semibold text-foreground">
        {point.weekday ? `${point.weekday}, ` : ""}
        {point.label}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground">
        <span className="text-base leading-none">{meta?.emoji}</span>
        <span>{meta?.label}</span>
      </div>
    </div>
  );
}
