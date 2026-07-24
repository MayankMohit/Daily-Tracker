"use client";

// The "overall idea of the day" block that sits under the mood chart: it pairs
// each day's logged mood with that day's task completion and reads the pattern
// back — today at a glance, plus how good- vs low-mood days compare over the
// month. All computed client-side so it updates the moment a cell or mood
// changes (the numbers come from the same live state that drives the charts).

import { moodMeta } from "@/lib/moods";

export interface MoodInsightData {
  /** Today's mood + completion, or null when viewing a past month. */
  today: { mood: number | null; completion: number | null } | null;
  /** Avg completion (0–1) on good-mood (≥4) and low-mood (≤2) days. */
  goodAvg: number | null;
  lowAvg: number | null;
  /** Pearson correlation of mood vs completion, and how many paired days fed it. */
  correlation: number | null;
  pairedDays: number;
}

function pct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

// Turn the correlation coefficient into a plain-language read of the link.
function verdict(d: MoodInsightData): string {
  if (d.pairedDays < 3) {
    return "Log your mood on a few more days to see how it tracks with what you get done.";
  }
  const r = d.correlation;
  if (r === null) {
    return "Not enough variation yet to link mood and productivity.";
  }
  const strength =
    Math.abs(r) >= 0.6 ? "strongly" : Math.abs(r) >= 0.3 ? "noticeably" : "only weakly";
  if (Math.abs(r) < 0.15) {
    return "Your mood and how much you complete don't move together much — productivity holds fairly steady across moods.";
  }
  return r > 0
    ? `Better moods ${strength} track with getting more done.`
    : `Lower moods ${strength} track with getting more done — you may push hardest on off days.`;
}

export function MoodInsight({ data }: { data: MoodInsightData }) {
  const meta = data.today?.mood ? moodMeta(data.today.mood) : undefined;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Mood × Productivity
        </h3>
        {data.pairedDays > 0 && (
          <span className="text-[11px] text-muted">
            {data.pairedDays} day{data.pairedDays === 1 ? "" : "s"} paired
          </span>
        )}
      </div>

      {data.today && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted">Today</span>
          {meta ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base leading-none">{meta.emoji}</span>
              <span className="font-medium text-foreground">{meta.label}</span>
            </span>
          ) : (
            <span className="text-muted">no mood set</span>
          )}
          <span className="text-border">·</span>
          <span className="tabular-nums text-foreground">
            {data.today.completion === null
              ? "no tasks yet"
              : `${Math.round(data.today.completion)}% done`}
          </span>
        </div>
      )}

      <p className="mt-3 text-sm text-foreground/90">{verdict(data)}</p>

      {(data.goodAvg !== null || data.lowAvg !== null) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat
            emoji="🙂"
            label="On good-mood days"
            value={pct(data.goodAvg)}
            sub="avg completion"
          />
          <Stat
            emoji="🙁"
            label="On low-mood days"
            value={pct(data.lowAvg)}
            sub="avg completion"
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  emoji,
  label,
  value,
  sub,
}: {
  emoji: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="text-sm leading-none">{emoji}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums leading-none text-foreground">
        {value}
      </div>
      <div className="mt-1 text-[10px] text-muted">{sub}</div>
    </div>
  );
}
