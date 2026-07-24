"use client";

// Day Planner (plan §3.5): collect any one-off requirements for the day, then
// ask Gemini to time-block them alongside today's recurring tasks.

import { useState } from "react";
import { Card, Button, inputClass } from "@/components/ui";
import { api } from "@/lib/client";
import type { DailyPlan } from "@/lib/types";

interface Item {
  description: string;
  estimatedDuration?: number;
}

export function PlannerClient({
  date,
  initialPlan,
}: {
  date: string;
  initialPlan: DailyPlan | null;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [desc, setDesc] = useState("");
  const [mins, setMins] = useState("");
  const [plan, setPlan] = useState<DailyPlan | null>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    const d = desc.trim();
    if (!d) return;
    const m = parseInt(mins, 10);
    setItems((prev) => [
      ...prev,
      { description: d, estimatedDuration: Number.isFinite(m) && m > 0 ? m : undefined },
    ]);
    setDesc("");
    setMins("");
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<DailyPlan>("/api/ai/plan", { date, items });
      setPlan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build a plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">One-off requirements</h3>
          <p className="mt-0.5 text-xs text-muted">
            Today&apos;s recurring tasks are included automatically. Add anything
            extra you need to fit in.
          </p>
        </div>

        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm"
              >
                <span>
                  {it.description}
                  {it.estimatedDuration ? (
                    <span className="text-muted"> · {it.estimatedDuration}m</span>
                  ) : null}
                </span>
                <button
                  onClick={() => removeItem(i)}
                  className="text-muted hover:text-danger"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            className={inputClass}
            placeholder="e.g. Dentist appointment"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <input
            className={inputClass + " w-20 shrink-0"}
            placeholder="min"
            inputMode="numeric"
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <Button variant="secondary" size="md" onClick={addItem}>
            Add
          </Button>
        </div>

        <Button onClick={generate} disabled={loading} className="w-full">
          {loading ? "Planning your day…" : "Generate plan"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-medium">
          Suggested schedule
          {plan && (
            <span className="ml-2 text-xs font-normal text-muted">
              generated {new Date(plan.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </h3>
        {plan && plan.blocks.length > 0 ? (
          <ol className="space-y-2">
            {plan.blocks.map((b, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-24 shrink-0 text-right text-sm tabular-nums text-muted">
                  {b.start}–{b.end}
                </div>
                <div className="flex-1 border-l border-border pl-3">
                  <div className="text-sm font-medium">{b.item}</div>
                  {b.note && <div className="text-xs text-muted">{b.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">
            Your time-blocked day will appear here.
          </p>
        )}
      </Card>
    </div>
  );
}
