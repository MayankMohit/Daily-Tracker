"use client";

// AI reflection card (plan §3, §6). Summaries are generated on demand (button)
// rather than on every page load, so viewing Insights never silently bills the
// model. Cached results (per day) are passed in from the server for first paint.

import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { api } from "@/lib/client";
import type { AiInsight } from "@/lib/types";

type SummaryType = "daily" | "weekly";

export function AiSummaryCard({
  initial,
}: {
  initial: Partial<Record<SummaryType, AiInsight | null>>;
}) {
  const [type, setType] = useState<SummaryType>("daily");
  const [byType, setByType] = useState<
    Partial<Record<SummaryType, AiInsight | null>>
  >(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insight = byType[type] ?? null;

  async function generate(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<AiInsight>("/api/ai/summary", {
        type,
        force,
      });
      setByType((prev) => ({ ...prev, [type]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5 text-sm">
          {(["daily", "weekly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={
                "rounded-md px-2.5 py-1 capitalize transition-colors " +
                (type === t
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground")
              }
            >
              {t}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant={insight ? "secondary" : "primary"}
          onClick={() => generate(Boolean(insight))}
          disabled={loading}
        >
          {loading
            ? "Thinking…"
            : insight
              ? "Regenerate"
              : `Generate ${type} summary`}
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {insight ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{insight.summary}</p>
          {insight.recommendations.length > 0 && (
            <ul className="space-y-1.5">
              {insight.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-accent">→</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        !error && (
          <p className="text-sm text-muted">
            Get an AI reflection on your {type === "daily" ? "day" : "week"} — a
            short summary plus a couple of specific suggestions.
          </p>
        )
      )}
    </Card>
  );
}
