"use client";

// Create-task form (plan §2, §2.1). Covers boolean tasks and both percentage
// modes (quantity with a unit picker + target, or a direct 0-100 slider). Also
// prefillable from AI parsing later (§3.2) since it takes an optional `initial`.

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { TaskInput } from "@/lib/schemas";
import type { Task } from "@/lib/types";
import { UNIT_GROUPS } from "@/lib/units";
import {
  PRIORITIES,
  RECURRENCES,
  WEEKDAY_LABELS,
  TASK_COLORS,
} from "@/lib/config";
import { Button, Field, inputClass, labelClass } from "./ui";
import { cn } from "@/lib/cn";

type TaskType = "boolean" | "percentage";
type Goal = "build" | "avoid";
type PctMode = "quantity" | "direct";

export function TaskForm({
  initial,
  taskId,
  categories = [],
  onCreated,
  onCancel,
}: {
  initial?: Partial<TaskInput>;
  /** When set, the form edits this task (PATCH) instead of creating a new one. */
  taskId?: string;
  /** Existing category names to offer in the dropdown. */
  categories?: string[];
  /** Called after a successful create/edit, with the task the server saved so
   *  callers can reflect it optimistically (splice into a list, close a modal). */
  onCreated: (task: Task) => void;
  onCancel: () => void;
}) {
  const editing = taskId !== undefined;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "build");
  const [type, setType] = useState<TaskType>(initial?.type ?? "boolean");
  const [pctMode, setPctMode] = useState<PctMode>(
    initial?.percentageConfig?.mode ?? "quantity",
  );
  const [unitType, setUnitType] = useState<"preset" | "custom">(
    initial?.percentageConfig?.unit?.type ?? "preset",
  );
  const [presetUnit, setPresetUnit] = useState(
    initial?.percentageConfig?.unit?.type === "preset"
      ? initial.percentageConfig.unit.value
      : "L",
  );
  const [customUnit, setCustomUnit] = useState(
    initial?.percentageConfig?.unit?.type === "custom"
      ? initial.percentageConfig.unit.value
      : "",
  );
  const [targetValue, setTargetValue] = useState<string>(
    initial?.percentageConfig?.targetValue?.toString() ?? "",
  );
  const [category, setCategory] = useState(initial?.category ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [recurrence, setRecurrence] = useState(
    initial?.recurrence ?? "daily",
  );
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(
    initial?.recurrenceDays ?? [1, 3, 5],
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  // For repeating tasks, whether to clip them to a start/end window. One-off
  // tasks use `startDate` as their single day, so the range toggle is for the
  // other recurrences only.
  const [limitRange, setLimitRange] = useState<boolean>(
    (initial?.recurrence ?? "daily") !== "one-off" &&
      Boolean(initial?.startDate || initial?.endDate),
  );
  const [duration, setDuration] = useState<string>(
    initial?.estimatedDuration?.toString() ?? "",
  );
  const [reminderOn, setReminderOn] = useState<boolean>(
    Boolean(initial?.reminder?.time),
  );
  const [reminderTime, setReminderTime] = useState(
    initial?.reminder?.time ?? "08:00",
  );
  const [reminderDays, setReminderDays] = useState<number[]>(
    initial?.reminder?.days ?? [1, 2, 3, 4, 5],
  );
  const [color, setColor] = useState<string | undefined>(initial?.color);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = useMemo(
    () =>
      unitType === "preset"
        ? { type: "preset" as const, value: presetUnit }
        : { type: "custom" as const, value: customUnit.trim() },
    [unitType, presetUnit, customUnit],
  );

  function toggleDay(list: number[], day: number): number[] {
    return list.includes(day)
      ? list.filter((d) => d !== day)
      : [...list, day].sort();
  }

  function validateLocal(): string | null {
    if (!title.trim()) return "Give the task a title.";
    if (type === "percentage" && pctMode === "quantity") {
      if (!unit.value) return "Pick or type a unit.";
      if (!targetValue || Number(targetValue) <= 0)
        return "Set a positive target value.";
    }
    if (recurrence === "custom" && recurrenceDays.length === 0)
      return "Pick at least one day for a custom recurrence.";
    if (recurrence === "one-off" && !startDate)
      return "Pick the day this one-off task happens.";
    if (recurrence !== "one-off" && limitRange && startDate && endDate && endDate < startDate)
      return "End date can't be before the start date.";
    return null;
  }

  async function submit() {
    const localErr = validateLocal();
    if (localErr) {
      setError(localErr);
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: TaskInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      goal,
      percentageConfig:
        type === "percentage"
          ? pctMode === "quantity"
            ? { mode: "quantity", unit, targetValue: Number(targetValue) }
            : { mode: "direct" }
          : undefined,
      category: category.trim() || undefined,
      priority: priority as TaskInput["priority"],
      estimatedDuration: duration ? Number(duration) : undefined,
      recurrence: recurrence as TaskInput["recurrence"],
      recurrenceDays: recurrence === "custom" ? recurrenceDays : undefined,
      // One-off: `startDate` is the single day it applies (no end). Repeating:
      // start/end only when the user opts into a date range.
      startDate:
        recurrence === "one-off"
          ? startDate || undefined
          : limitRange
            ? startDate || undefined
            : undefined,
      endDate:
        recurrence === "one-off"
          ? undefined
          : limitRange
            ? endDate || undefined
            : undefined,
      reminder: reminderOn
        ? { time: reminderTime, days: reminderDays }
        : undefined,
      color,
      active: true,
    };

    try {
      const saved = editing
        ? await api.patch<Task>(`/api/tasks/${taskId}`, payload)
        : await api.post<Task>("/api/tasks", payload);
      onCreated(saved);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : editing
            ? "Could not save changes."
            : "Could not create task.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Drink water"
          autoFocus
        />
      </Field>

      <Field label="Description" hint="Optional">
        <textarea
          className={cn(inputClass, "h-16 py-2")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any details…"
        />
      </Field>

      {/* Goal direction: build a habit vs break/avoid one */}
      <div>
        <span className={labelClass}>Goal</span>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <TypeCard
            active={goal === "build"}
            title="Do it"
            desc="Build a habit — mark the day when you do it."
            onClick={() => setGoal("build")}
          />
          <TypeCard
            active={goal === "avoid"}
            title="Avoid it"
            desc="Break a habit — e.g. quit smoking, no doomscrolling."
            onClick={() => {
              setGoal("avoid");
              // Abstinence is inherently yes/no, so it's always a boolean task.
              setType("boolean");
            }}
          />
        </div>
        {goal === "avoid" && (
          <p className="mt-1.5 text-xs text-muted">
            Tracked as a daily “stayed clean” check — each day you resist counts
            as a success.
          </p>
        )}
      </div>

      {/* Task type (only build tasks can be percentage; avoid is always boolean) */}
      {goal === "build" && (
        <div>
          <span className={labelClass}>Type</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <TypeCard
              active={type === "boolean"}
              title="Done / Not done"
              desc="A simple daily checkbox."
              onClick={() => setType("boolean")}
            />
            <TypeCard
              active={type === "percentage"}
              title="Percentage"
              desc="Track partial progress toward a goal."
              onClick={() => setType("percentage")}
            />
          </div>
        </div>
      )}

      {goal === "build" && type === "percentage" && (
        <div className="space-y-4 rounded-lg border border-border bg-surface-2/50 p-3">
          <div>
            <span className={labelClass}>Tracking mode</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <TypeCard
                active={pctMode === "quantity"}
                title="Quantity"
                desc="Enter an amount vs a target (e.g. 2.1 / 3 L)."
                onClick={() => setPctMode("quantity")}
              />
              <TypeCard
                active={pctMode === "direct"}
                title="Direct %"
                desc="Judge a 0–100% slider yourself."
                onClick={() => setPctMode("direct")}
              />
            </div>
          </div>

          {pctMode === "quantity" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="3"
                />
              </Field>
              <Field label="Unit">
                {unitType === "preset" ? (
                  <select
                    className={inputClass}
                    value={presetUnit}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setUnitType("custom");
                      } else {
                        setPresetUnit(e.target.value);
                      }
                    }}
                  >
                    {UNIT_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.units.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__custom__">Custom…</option>
                  </select>
                ) : (
                  <div className="flex gap-1.5">
                    <input
                      className={inputClass}
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      placeholder="e.g. pomodoros"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setUnitType("preset")}
                    >
                      Presets
                    </Button>
                  </div>
                )}
              </Field>
            </div>
          )}
        </div>
      )}

      {/* Category + priority */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" hint="Optional">
          {/* Combobox: click to pick an existing category, or just type a new one. */}
          <input
            className={inputClass}
            list="task-category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Health, Work…"
            autoComplete="off"
          />
          {categories.length > 0 && (
            <datalist id="task-category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          )}
        </Field>
        <Field label="Priority">
          <select
            className={inputClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Recurrence */}
      <Field label="Repeats">
        <select
          className={inputClass}
          value={recurrence}
          onChange={(e) => {
            const r = e.target.value as typeof recurrence;
            setRecurrence(r);
            // A one-off needs a day; default it to tomorrow for a sensible start.
            if (r === "one-off" && !startDate) setStartDate(tomorrowKey());
          }}
        >
          {RECURRENCES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      {recurrence === "custom" && (
        <DayPicker selected={recurrenceDays} onToggle={(d) => setRecurrenceDays((l) => toggleDay(l, d))} />
      )}

      {/* Scheduling window. One-off → a single day; other recurrences → an
          optional start/end range that clips when the task is active. */}
      {recurrence === "one-off" ? (
        <Field label="On which day?" hint="Shows only on this date">
          <div className="flex gap-1.5">
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStartDate(tomorrowKey())}
            >
              Tomorrow
            </Button>
          </div>
        </Field>
      ) : (
        <div className="rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={limitRange}
              onChange={(e) => setLimitRange(e.target.checked)}
            />
            Limit to a date range
          </label>
          {limitRange && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Start" hint="Optional">
                <input
                  type="date"
                  className={inputClass}
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="End" hint="Optional">
                <input
                  type="date"
                  className={inputClass}
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* Duration */}
      <Field label="Estimated duration (min)" hint="Optional — used by the Day Planner">
        <input
          className={inputClass}
          type="number"
          min="0"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="e.g. 30"
        />
      </Field>

      {/* Reminder */}
      <div className="rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={reminderOn}
            onChange={(e) => setReminderOn(e.target.checked)}
          />
          Remind me
        </label>
        {reminderOn && (
          <div className="mt-3 space-y-3">
            <Field label="Time">
              <input
                className={inputClass}
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
            </Field>
            <DayPicker
              selected={reminderDays}
              onToggle={(d) => setReminderDays((l) => toggleDay(l, d))}
            />
          </div>
        )}
      </div>

      {/* Color */}
      <div>
        <span className={labelClass}>Color</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setColor(undefined)}
            className={cn(
              "h-7 w-7 rounded-full border border-border text-xs",
              !color && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
            )}
            title="No color"
          >
            —
          </button>
          {TASK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "h-7 w-7 rounded-full",
                color === c && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {editing
            ? submitting
              ? "Saving…"
              : "Save changes"
            : submitting
              ? "Creating…"
              : "Create task"}
        </Button>
      </div>
    </form>
  );
}

/** Local calendar date of tomorrow as a YYYY-MM-DD key, for the date input. */
function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function TypeCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-accent bg-accent/10"
          : "border-border hover:bg-surface-2",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-0.5 text-xs text-muted">{desc}</div>
    </button>
  );
}

function DayPicker({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div>
      <span className={labelClass}>Days</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {WEEKDAY_LABELS.map((label, day) => (
          <button
            key={day}
            type="button"
            onClick={() => onToggle(day)}
            className={cn(
              "h-9 w-11 rounded-md border text-xs font-medium transition-colors",
              selected.includes(day)
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
