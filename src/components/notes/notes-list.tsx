"use client";

// Standalone notes manager for the /notes page: a grid of note cards, a "New
// note" action, and a modal editor. All mutations update local state optimistically
// so the list stays snappy without a full server refresh.

import { useState } from "react";
import type { Note } from "@/lib/types";
import { Button, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { NoteEditor } from "./note-editor";
import { NoteMarkdown } from "./note-markdown";

export function NotesList({ initial }: { initial: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initial);
  const [editing, setEditing] = useState<Note | "new" | null>(null);

  function upsertLocal(n: Note) {
    setNotes((list) => {
      const i = list.findIndex((x) => x._id === n._id);
      if (i === -1) return [n, ...list];
      const next = [...list];
      next[i] = n;
      return next;
    });
  }

  function removeLocal(id: string) {
    setNotes((list) => list.filter((x) => x._id !== id));
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>+ New note</Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          description="Jot anything down — a checklist, an idea, a plan. Notes support bullets, checkboxes, and basic formatting."
          action={<Button onClick={() => setEditing("new")}>+ New note</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <button
              key={n._id}
              type="button"
              onClick={() => setEditing(n)}
              className="text-left"
            >
              <Card className="h-full transition-colors hover:bg-surface-2/50">
                {n.title && (
                  <div className="mb-1 truncate font-medium">{n.title}</div>
                )}
                <div className="max-h-40 overflow-hidden">
                  {n.body.trim() ? (
                    <NoteMarkdown body={n.body} className="pointer-events-none" />
                  ) : (
                    <p className="text-sm text-muted">Empty note</p>
                  )}
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New note" : "Edit note"}
        size="4xl"
      >
        {editing !== null && (
          <NoteEditor
            note={editing === "new" ? undefined : editing}
            autoFocus
            onSaved={upsertLocal}
            onDeleted={(id) => (id ? removeLocal(id) : setEditing(null))}
          />
        )}
      </Modal>
    </div>
  );
}
