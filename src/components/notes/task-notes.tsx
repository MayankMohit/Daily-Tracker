"use client";

// A task's attached notes, shown inside the task row menu's modal. Fetches the
// task's notes on open, lists them (read-only preview), and swaps to the shared
// NoteEditor to add or edit one. Kept flat (no nested modal) since it already
// renders inside one.

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Note } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui";
import { NoteEditor } from "./note-editor";
import { NoteMarkdown } from "./note-markdown";

export function TaskNotes({
  taskId,
  onCountChange,
}: {
  taskId: string;
  /** Notified with the current note count so the caller can update a badge. */
  onCountChange?: (count: number) => void;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null); // null = loading
  const [editing, setEditing] = useState<Note | "new" | null>(null);

  useEffect(() => {
    api
      .get<Note[]>(`/api/notes?taskId=${encodeURIComponent(taskId)}`)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [taskId]);

  function sync(list: Note[]) {
    setNotes(list);
    onCountChange?.(list.length);
  }

  function upsertLocal(n: Note) {
    const list = notes ?? [];
    const i = list.findIndex((x) => x._id === n._id);
    sync(i === -1 ? [n, ...list] : list.map((x) => (x._id === n._id ? n : x)));
  }

  function removeLocal(id: string) {
    sync((notes ?? []).filter((x) => x._id !== id));
    setEditing(null);
  }

  if (editing !== null) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="text-sm text-muted hover:text-foreground"
        >
          ← Back to notes
        </button>
        <NoteEditor
          note={editing === "new" ? undefined : editing}
          taskId={taskId}
          autoFocus
          onSaved={upsertLocal}
          onDeleted={(id) => (id ? removeLocal(id) : setEditing(null))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          + Add note
        </Button>
      </div>

      {notes === null ? (
        <p className="py-6 text-center text-sm text-muted">Loading…</p>
      ) : notes.length === 0 ? (
        <EmptyState
          title="No notes on this task"
          description="Attach a checklist or reminder specific to this task."
          action={<Button size="sm" onClick={() => setEditing("new")}>+ Add note</Button>}
        />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <button
              key={n._id}
              type="button"
              onClick={() => setEditing(n)}
              className="block w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-2/50"
            >
              {n.title && <div className="mb-1 truncate font-medium">{n.title}</div>}
              <div className="max-h-24 overflow-hidden">
                {n.body.trim() ? (
                  <NoteMarkdown body={n.body} className="pointer-events-none" />
                ) : (
                  <span className="text-sm text-muted">Empty note</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
