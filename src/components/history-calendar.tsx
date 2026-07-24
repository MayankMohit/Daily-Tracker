"use client";

// Read-only day history (plan: browse past days). A month calendar with month +
// year navigation; clicking a day opens a recap of everything logged that day —
// tasks & completion, mood, extra activities, and the journal. Tasks/mood/extras
// are plaintext and shown immediately; the journal is end-to-end encrypted, so
// its text is decrypted in the browser once the passphrase is entered (or reused
// from an unlock earlier in the tab). Nothing here writes or edits.

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type {
  Task,
  TaskLog,
  TaskLogValue,
  MoodLog,
  ExtraActivity,
} from "@/lib/types";
import { moodMeta } from "@/lib/moods";
import { taskAppliesOn } from "@/lib/recurrence";
import {
  dayKeyToDate,
  toDayKey,
  monthDays,
  monthKeyToDate,
  shiftMonth,
  monthLabel,
  dayOfWeek,
  type DayKey,
  type MonthKey,
} from "@/lib/date";
import {
  type KeyEnvelope,
  openEnvelope,
  decryptText,
  readCachedDek,
  cacheDek,
} from "@/lib/journal-crypto";
import { Card, Button, inputClass } from "./ui";
import { cn } from "@/lib/cn";
import { logKey } from "@/lib/keys";

interface JournalCell {
  date: string;
  cipher?: string;
  iv?: string;
  text?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HistoryCalendar({
  month,
  currentMonth,
  today,
  tasks,
  logs,
  moods,
  journals,
  extras,
  crypto: envelope,
  userKey,
}: {
  month: MonthKey;
  currentMonth: MonthKey;
  today: DayKey;
  tasks: Task[];
  logs: TaskLog[];
  moods: MoodLog[];
  journals: JournalCell[];
  extras: ExtraActivity[];
  crypto: KeyEnvelope | null;
  userKey: string;
}) {
  const days = useMemo(() => monthDays(monthKeyToDate(month)!), [month]);

  const logIndex = useMemo(() => {
    const m = new Map<string, TaskLog>();
    for (const l of logs) m.set(logKey(l.taskId, l.date), l);
    return m;
  }, [logs]);

  const logDates = useMemo(() => new Set(logs.map((l) => l.date)), [logs]);
  const moodByDate = useMemo(() => {
    const m = new Map<DayKey, number>();
    for (const x of moods) m.set(x.date, x.mood);
    return m;
  }, [moods]);
  const journalByDate = useMemo(() => {
    const m = new Map<DayKey, JournalCell>();
    for (const j of journals) m.set(j.date, j);
    return m;
  }, [journals]);
  const extrasByDate = useMemo(() => {
    const m = new Map<DayKey, ExtraActivity[]>();
    for (const e of extras) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [extras]);

  const hasContent = (cell?: JournalCell) =>
    !!cell && (!!cell.cipher || !!(cell.text && cell.text.trim()));

  const hasData = (date: DayKey) =>
    logDates.has(date) ||
    moodByDate.has(date) ||
    hasContent(journalByDate.get(date)) ||
    (extrasByDate.get(date)?.length ?? 0) > 0;

  // Default selection: today if it's in this month, else the latest day that has
  // any data, else nothing.
  const initialSelected = useMemo(() => {
    if (days.includes(today)) return today;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i] <= today && hasData(days[i])) return days[i];
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, today]);

  const [selected, setSelected] = useState<DayKey | null>(initialSelected);

  // Journal key: reuse a DEK cached from an earlier unlock in this tab.
  const [dek, setDek] = useState<CryptoKey | null>(null);
  useEffect(() => {
    (async () => {
      const d = await readCachedDek(userKey);
      if (d) setDek(d);
    })();
  }, [userKey]);

  // Leading blanks so the 1st lands under the right weekday (Monday-first).
  const firstDow = dayOfWeek(days[0]); // 0=Sun..6=Sat
  const leading = (firstDow + 6) % 7;

  const monthPrev = shiftMonth(month, -1);
  const monthNext = shiftMonth(month, 1);
  const yearPrev = shiftMonth(month, -12);
  const yearNext = shiftMonth(month, 12);
  const canForward = (m: MonthKey) => m <= currentMonth;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="space-y-4">
          <CalNav
            label={monthLabel(month)}
            yearPrev={yearPrev}
            monthPrev={monthPrev}
            monthNext={canForward(monthNext) ? monthNext : null}
            yearNext={canForward(yearNext) ? yearNext : null}
          />

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 font-medium">
                {w}
              </div>
            ))}
            {Array.from({ length: leading }).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {days.map((d) => {
              const future = d > today;
              const isSel = d === selected;
              const isToday = d === today;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={future}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "relative aspect-square rounded-md text-sm transition-colors",
                    future
                      ? "cursor-default text-muted/40"
                      : "hover:bg-surface-2",
                    isSel
                      ? "bg-accent text-accent-foreground hover:bg-accent"
                      : isToday
                        ? "ring-1 ring-inset ring-accent text-foreground"
                        : "text-foreground",
                  )}
                >
                  {format(dayKeyToDate(d), "d")}
                  {!future && hasData(d) && (
                    <span
                      className={cn(
                        "absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                        isSel ? "bg-accent-foreground" : "bg-accent",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> has activity
            logged
          </p>
        </Card>

        <DayPanel
          date={selected}
          tasks={tasks}
          logIndex={logIndex}
          mood={selected ? (moodByDate.get(selected) ?? null) : null}
          journal={selected ? journalByDate.get(selected) : undefined}
          dayExtras={selected ? (extrasByDate.get(selected) ?? []) : []}
          envelope={envelope}
          userKey={userKey}
          dek={dek}
          onUnlocked={setDek}
        />
      </div>
    </div>
  );
}

function CalNav({
  label,
  yearPrev,
  monthPrev,
  monthNext,
  yearNext,
}: {
  label: string;
  yearPrev: MonthKey;
  monthPrev: MonthKey;
  monthNext: MonthKey | null;
  yearNext: MonthKey | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <NavBtn to={yearPrev} title="Previous year">
          «
        </NavBtn>
        <NavBtn to={monthPrev} title="Previous month">
          ‹
        </NavBtn>
      </div>
      <h2 className="text-sm font-semibold text-foreground">{label}</h2>
      <div className="flex items-center gap-1">
        <NavBtn to={monthNext} title="Next month">
          ›
        </NavBtn>
        <NavBtn to={yearNext} title="Next year">
          »
        </NavBtn>
      </div>
    </div>
  );
}

function NavBtn({
  to,
  title,
  children,
}: {
  to: MonthKey | null;
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm";
  if (!to) {
    return (
      <span className={cn(cls, "cursor-default text-muted/30")}>{children}</span>
    );
  }
  return (
    <Link
      href={`/history?month=${to}`}
      title={title}
      className={cn(cls, "text-muted hover:bg-surface-2 hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

function DayPanel({
  date,
  tasks,
  logIndex,
  mood,
  journal,
  dayExtras,
  envelope,
  userKey,
  dek,
  onUnlocked,
}: {
  date: DayKey | null;
  tasks: Task[];
  logIndex: Map<string, TaskLog>;
  mood: number | null;
  journal: JournalCell | undefined;
  dayExtras: ExtraActivity[];
  envelope: KeyEnvelope | null;
  userKey: string;
  dek: CryptoKey | null;
  onUnlocked: (dek: CryptoKey) => void;
}) {
  if (!date) {
    return (
      <Card className="flex min-h-64 items-center justify-center text-sm text-muted">
        Select a day to see everything you logged.
      </Card>
    );
  }

  const dateObj = dayKeyToDate(date);
  const applicable = tasks
    .filter(
      (t) =>
        taskAppliesOn(t, date) && date >= toDayKey(new Date(t.createdAt)),
    )
    .sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt),
    );
  const doneCount = applicable.filter((t) => {
    const log = logIndex.get(logKey(t._id, date));
    return log ? isSuccess(log.value) : false;
  }).length;
  const moodInfo = mood ? moodMeta(mood) : null;

  return (
    <Card className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {format(dateObj, "EEEE")}
        </h1>
        <p className="text-sm text-muted">{format(dateObj, "MMMM d, yyyy")}</p>
      </div>

      {/* Tasks */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Tasks
          </h2>
          {applicable.length > 0 && (
            <span className="text-xs text-muted">
              {doneCount}/{applicable.length} done
            </span>
          )}
        </div>
        {applicable.length === 0 ? (
          <p className="text-sm text-muted">No tasks were scheduled this day.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {applicable.map((t) => {
              const log = logIndex.get(logKey(t._id, date));
              return (
                <li
                  key={t._id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    {t.color && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                    )}
                    {t.title}
                  </span>
                  <StatusBadge log={log} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Mood */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Mood
        </h2>
        {moodInfo ? (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <span className="text-lg leading-none">{moodInfo.emoji}</span>
            {moodInfo.label}
          </p>
        ) : (
          <p className="text-sm text-muted">No mood logged.</p>
        )}
      </section>

      {/* Extra activities */}
      {dayExtras.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Also did
          </h2>
          <ul className="space-y-1 text-sm text-foreground">
            {dayExtras.map((e) => (
              <li key={e._id} className="flex items-center gap-2">
                <span className="text-muted">·</span>
                {e.description}
                {e.estimatedDuration ? (
                  <span className="text-xs text-muted">
                    ({e.estimatedDuration}m)
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Journal (encrypted) */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Journal
        </h2>
        <JournalView
          entry={journal}
          envelope={envelope}
          userKey={userKey}
          dek={dek}
          onUnlocked={onUnlocked}
        />
      </section>
    </Card>
  );
}

function JournalView({
  entry,
  envelope,
  userKey,
  dek,
  onUnlocked,
}: {
  entry: JournalCell | undefined;
  envelope: KeyEnvelope | null;
  userKey: string;
  dek: CryptoKey | null;
  onUnlocked: (dek: CryptoKey) => void;
}) {
  // Async decryption result, tagged with the ciphertext it belongs to so a stale
  // result from a previous day is never shown. Only the async branch (after the
  // await) sets state, which keeps the effect free of synchronous setState.
  const [result, setResult] = useState<{
    forCipher: string;
    text?: string;
    error?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!entry?.cipher || !dek) return;
    let cancelled = false;
    const cipher = entry.cipher;
    (async () => {
      try {
        const t = await decryptText(dek, cipher, entry.iv!);
        if (!cancelled) setResult({ forCipher: cipher, text: t });
      } catch {
        if (!cancelled) setResult({ forCipher: cipher, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, dek]);

  const hasContent =
    entry && (entry.cipher || (entry.text && entry.text.trim()));

  if (!hasContent) {
    return <p className="text-sm text-muted">No journal entry for this day.</p>;
  }

  // Legacy plaintext (pre-encryption, not yet migrated) — shown directly.
  if (!entry!.cipher && entry!.text) {
    return <JournalText text={entry!.text} />;
  }

  // Encrypted, but no key in this tab yet.
  if (!dek) {
    return (
      <UnlockInline
        envelope={envelope}
        userKey={userKey}
        onUnlocked={onUnlocked}
      />
    );
  }

  // Encrypted with a key available — show the decryption result for THIS entry.
  if (result && result.forCipher === entry!.cipher) {
    if (result.error) {
      return (
        <p className="text-sm text-danger">
          Couldn&rsquo;t decrypt this entry with the current key.
        </p>
      );
    }
    return <JournalText text={result.text ?? ""} />;
  }
  return <p className="text-sm text-muted">Decrypting…</p>;
}

function JournalText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm leading-relaxed text-foreground">
      {text}
    </div>
  );
}

function UnlockInline({
  envelope,
  userKey,
  onUnlocked,
}: {
  envelope: KeyEnvelope | null;
  userKey: string;
  onUnlocked: (dek: CryptoKey) => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!envelope) {
    return (
      <p className="text-sm text-muted">
        This entry is encrypted, but no passphrase is set on this account.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const dek = await openEnvelope(passphrase, envelope!);
      if (!dek) {
        setError("Incorrect passphrase. Try again.");
        setBusy(false);
        return;
      }
      await cacheDek(userKey, dek);
      onUnlocked(dek);
    } catch {
      setError("Couldn't unlock. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3"
    >
      <p className="text-sm text-muted">
        🔒 This entry is end-to-end encrypted. Enter your passphrase to read it.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="current-password"
          className={inputClass}
          placeholder="Your passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <Button type="submit" disabled={busy} size="sm" className="shrink-0">
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

// ---- Read-only log formatting (client-safe; mirrors the dashboard) ----

function isSuccess(v: TaskLogValue): boolean {
  if (v.kind === "boolean") return !!v.boolStatus;
  return (v.percentage ?? 0) >= 100;
}

function StatusBadge({ log }: { log?: TaskLog }) {
  if (!log) {
    return <span className="text-xs text-muted">Not logged</span>;
  }
  const v = log.value;
  if (v.kind === "boolean") {
    return v.boolStatus ? (
      <span className="text-sm text-success">✓</span>
    ) : (
      <span className="text-xs text-muted">Not done</span>
    );
  }
  if (v.kind === "quantity") {
    return (
      <span className="text-xs tabular-nums text-foreground">
        {v.actualValue ?? 0}
        {v.unitSnapshot ? ` ${v.unitSnapshot}` : ""} of {v.targetValueSnapshot ?? "?"}{" "}
        <span className="text-muted">({v.percentage ?? 0}%)</span>
      </span>
    );
  }
  return (
    <span className="text-xs tabular-nums text-foreground">
      {v.percentage ?? 0}%
    </span>
  );
}
