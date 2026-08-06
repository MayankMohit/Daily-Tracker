"use client";

// Natural-language task creation (plan §3.2). Type a phrase like "drink 3L of
// water every day"; Gemini drafts a structured task, which the user confirms
// before it's created. Confirmation keeps the user in control of what's saved.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, inputClass } from "@/components/ui";
import { Modal } from "@/components/modal";
import { TaskForm } from "@/components/task-form";
import { api } from "@/lib/client";
import type { TaskInput } from "@/lib/schemas";

function chips(t: TaskInput): string[] {
  const bits: string[] = [
    t.goal === "avoid"
      ? "avoid habit"
      : t.type === "boolean"
        ? "yes/no habit"
        : "progress goal",
  ];
  if (t.type === "percentage" && t.percentageConfig?.mode === "quantity") {
    bits.push(
      `target ${t.percentageConfig.targetValue} ${t.percentageConfig.unit?.value ?? ""}`.trim(),
    );
  }
  if (t.category) bits.push(t.category);
  bits.push(t.recurrence);
  if (t.priority !== "medium") bits.push(`${t.priority} priority`);
  if (t.estimatedDuration) bits.push(`~${t.estimatedDuration} min`);
  if (t.reminder?.time) bits.push(`⏰ ${t.reminder.time}`);
  return bits;
}

export function AiQuickAdd({
  action,
  categories = [],
}: {
  action?: React.ReactNode;
  /** Existing category names offered as suggestions in the edit form. */
  categories?: string[];
}) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<TaskInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function draftTask() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api.post<TaskInput>("/api/ai/parse-task", { text });
      setDraft(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft that.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/tasks", draft);
      setDraft(null);
      setText("");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-2.5 p-2.5">
      {/* Mobile: input + Draft on row 1, New task full-width below. Desktop
          (sm+): the New task button reverts to auto width and sits inline, so
          all three share one row exactly as before. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} h-9 min-w-0 flex-1`}
          placeholder="Describe a task"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draftTask()}
          disabled={loading || saving}
        />
        <Button
          size="sm"
          className="h-9 shrink-0"
          onClick={draftTask}
          disabled={loading || saving || !text.trim()}
        >
          {loading ? "Drafting…" : "Draft with AI"}
        </Button>
        {action}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {draft && (
        <div className="space-y-2.5 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="truncate text-sm font-semibold">{draft.title}</div>
              {draft.description && (
                <p className="text-xs leading-relaxed text-muted">
                  {draft.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing(true)}
                disabled={saving}
              >
                Edit
              </Button>
              <Button size="sm" onClick={confirm} disabled={saving}>
                {saving ? "Adding…" : "Add task"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips(draft).map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-border"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {draft && (
        <Modal
          open={editing}
          onClose={() => setEditing(false)}
          title="Review task"
        >
          <TaskForm
            initial={draft}
            categories={categories}
            onCancel={() => setEditing(false)}
            onCreated={() => {
              setEditing(false);
              setDraft(null);
              setText("");
              startTransition(() => router.refresh());
            }}
          />
        </Modal>
      )}
    </Card>
  );
}
