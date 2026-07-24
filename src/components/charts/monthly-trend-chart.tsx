"use client";

// Monthly completion trend, drawn to line up with the task table above it. The
// table owns the column layout, measures each date column's centre, and hands us
// those x-coordinates (plus the plot's left/right bounds and the shared width) so
// every point sits exactly under its day. We render a plain SVG at the measured
// pixel width — no axis gutter that would shift the plot — so the line starts
// where day 1 begins and ends where the table ends, at any screen size.
//
// Hovering anywhere in a day's vertical band (not just the 3px dot) opens a rich
// tooltip: that day's overall completion plus a per-task breakdown.

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface TrendItem {
  title: string;
  color?: string;
  /** Short status, e.g. "Done", "2.4 / 3 L · 80%". */
  text: string;
  done: boolean;
}

export interface TrendExtra {
  description: string;
  category?: string;
  duration?: number;
}

export interface TrendDetail {
  /** 0–100 overall completion for the day. */
  completion: number;
  applicable: number;
  completed: number;
  items: TrendItem[];
  /** Ad-hoc "what else I did today" entries logged that day. */
  extras?: TrendExtra[];
}

export interface TrendPoint {
  /** Centre x (px) of this day's column, relative to the chart's left edge. */
  x: number;
  /** 0–100 completion, or null for days with no tasks / still in the future. */
  value: number | null;
  /** Human date label, e.g. "Jul 5". */
  label: string;
  weekday?: string;
  future?: boolean;
  detail?: TrendDetail | null;
}

export function MonthlyTrendChart({
  points,
  width,
  plotLeft,
  plotRight,
  height = 168,
}: {
  points: TrendPoint[];
  width: number;
  plotLeft: number;
  plotRight: number;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const padTop = 16;
  const padBottom = 20;
  const plotH = height - padTop - padBottom;
  const yFor = (v: number) => padTop + (1 - v / 100) * plotH;

  // Connect across gaps (missing / future days) so the trend reads as one line.
  const defined = points.filter(
    (p): p is TrendPoint & { value: number } => p.value !== null,
  );
  const path = defined
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${yFor(p.value).toFixed(2)}`,
    )
    .join(" ");

  // Each day owns a hover band reaching halfway to its neighbours, so pointing
  // anywhere in a column — not just at the dot — selects that day.
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
    if (!box) return;
    const y = p.value !== null ? yFor(p.value) : padTop;
    setActive(i);
    // No scaling (SVG rendered at its viewBox width), so svg-x maps 1:1 to px.
    setAnchor({ x: box.left + p.x, y: box.top + y });
  };
  const hide = () => {
    setActive(null);
    setAnchor(null);
  };

  const act = active !== null ? points[active] : null;
  const gridVals = [0, 50, 100];

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label="Daily completion percentage over the month"
        onMouseLeave={hide}
      >
        {/* Horizontal gridlines span the plot; % labels sit in the empty left
            gutter (under the Task/Est. columns) so they don't shift the plot. */}
        {gridVals.map((v) => {
          const y = yFor(v);
          return (
            <g key={v}>
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray={v === 0 ? undefined : "3 3"}
              />
              <text
                x={plotLeft - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--muted)"
              >
                {v}%
              </text>
            </g>
          );
        })}

        {/* Vertical guide at the hovered day. */}
        {act && (
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
            cy={yFor(p.value)}
            r={3}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={1.5}
          />
        ))}

        {/* Enlarged ring on the active point. */}
        {act && act.value !== null && (
          <circle
            cx={act.x}
            cy={yFor(act.value)}
            r={5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}

        {/* Transparent per-day hit areas — the wide hover targets. Drawn last so
            they sit above the line and dots. */}
        {points.map((p, i) =>
          p.detail ? (
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

      {act && anchor && act.detail && (
        <TrendTooltip point={act} detail={act.detail} anchor={anchor} />
      )}
    </>
  );
}

function TrendTooltip({
  point,
  detail,
  anchor,
}: {
  point: TrendPoint;
  detail: TrendDetail;
  anchor: { x: number; y: number };
}) {
  // Keep the card on-screen near the left/right edges by flipping its anchor.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const align = anchor.x < 150 ? "start" : anchor.x > vw - 150 ? "end" : "center";
  const tx = align === "center" ? "-50%" : align === "start" ? "0%" : "-100%";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 w-max max-w-[280px] rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-left shadow-lg"
      style={{ left: anchor.x, top: anchor.y - 12, transform: `translate(${tx}, -100%)` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold text-foreground">
          {point.weekday ? `${point.weekday}, ` : ""}
          {point.label}
        </div>
        {detail.applicable > 0 && (
          <div className="text-sm font-semibold tabular-nums text-accent">
            {Math.round(detail.completion)}%
          </div>
        )}
      </div>

      {detail.applicable > 0 && (
        <>
          <div className="mt-0.5 text-[11px] text-muted">
            {detail.completed} of {detail.applicable} task
            {detail.applicable === 1 ? "" : "s"} completed
          </div>
          <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
            {detail.items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: it.color ?? "var(--muted)" }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground/90">
                  {it.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    it.done ? "font-medium text-foreground" : "text-muted",
                  )}
                >
                  {it.text}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {detail.extras && detail.extras.length > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent/70">
            Also did
          </div>
          <div className="space-y-1">
            {detail.extras.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-foreground/90">
                  {e.description}
                </span>
                {e.category && (
                  <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                    {e.category}
                  </span>
                )}
                {e.duration != null && (
                  <span className="shrink-0 tabular-nums text-muted">
                    {e.duration}m
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
