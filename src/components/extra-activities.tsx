"use client";

// Ad-hoc activity log (plan §3.4): things done today that weren't tracked tasks.
// Category is a free/dropdown pick from existing task categories — no AI call.

import { useState } from "react";
import type { ExtraActivity } from "@/lib/types";
import { api } from "@/lib/client";
import type { DayKey } from "@/lib/date";
import { Card, inputClass, Button } from "./ui";

export function ExtraActivities({
  date,
  initial,
  categories,
}: {
  date: DayKey;
  initial: ExtraActivity[];
  categories: string[];
}) {
  const [items, setItems] = useState<ExtraActivity[]>(initial);
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const desc = description.trim();
    if (!desc) return;
    setBusy(true);
    try {
      const created = await api.post<ExtraActivity>("/api/extra-activities", {
        date,
        description: desc,
        estimatedDuration: duration ? Number(duration) : undefined,
        category: category || undefined,
      });
      setItems((xs) => [...xs, created]);
      setDescription("");
      setDuration("");
      setCategory("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((xs) => xs.filter((x) => x._id !== id));
    try {
      await api.del(`/api/extra-activities/${id}`);
    } catch {
      setItems(prev);
    }
  }

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-medium">Also did today</h3>

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li
              key={a._id}
              className="group flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm"
            >
              <span className="flex-1">{a.description}</span>
              {a.category && (
                <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-muted">
                  {a.category}
                </span>
              )}
              {a.estimatedDuration && (
                <span className="text-xs text-muted">{a.estimatedDuration}m</span>
              )}
              <button
                type="button"
                onClick={() => remove(a._id)}
                aria-label="Remove"
                className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={`${inputClass} flex-1 min-w-[160px]`}
          placeholder="+ Add something else you did"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className={`${inputClass} w-20`}
          type="number"
          min="0"
          placeholder="min"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
        {categories.length > 0 && (
          <select
            className={`${inputClass} w-32`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          Add
        </Button>
      </form>
    </Card>
  );
}
