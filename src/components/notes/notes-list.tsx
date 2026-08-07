"use client";

// Standalone notes manager for the /notes page: a grid of note cards, a "New
// note" action, and a modal editor. All mutations update local state optimistically
// so the list stays snappy without a full server refresh.

import { useEffect, useState } from "react";
import type { Note } from "@/lib/types";
import { Button, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { NoteEditor } from "./note-editor";
import { NoteMarkdown } from "./note-markdown";
import { outboxAll, OUTBOX_CHANGED, OUTBOX_DRAINED } from "@/lib/offline/outbox";

export function NotesList({ initial }: { initial: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initial);
  const [editing, setEditing] = useState<Note | "new" | null>(null);

  // Offline resilience: a reload reseeds the list from stale cached server data,
  // which doesn't include note edits/creates/deletes still queued in the outbox —
  // so without this, an offline edit appears to revert on refresh. Re-apply the
  // pending mutations on mount (and when the outbox changes). Once synced the
  // outbox empties and this is a no-op.
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void outboxAll().then((recs) => {
        if (cancelled) return;
        setNotes((cur) => {
          let list = cur;
          for (const rec of recs) {
            const b = (rec.body ?? {}) as { id?: string; taskId?: string; title?: string; body?: string };
            const stamp = new Date(rec.createdAt).toISOString();
            const title = b.title?.trim() || undefined;
            if (rec.kind === "note-upsert" && b.id) {
              // Edit of an existing note — apply the queued title/body.
              list = list.map((n) =>
                n._id === b.id ? { ...n, title, body: b.body ?? n.body, updatedAt: stamp } : n,
              );
            } else if (rec.kind === "note-upsert" && rec.tempId && !b.taskId) {
              // Offline-created standalone note — add it if not already shown.
              if (!list.some((n) => n._id === rec.tempId)) {
                list = [
                  {
                    _id: rec.tempId,
                    userId: "local",
                    title,
                    body: b.body ?? "",
                    createdAt: stamp,
                    updatedAt: stamp,
                  },
                  ...list,
                ];
              }
            } else if (rec.kind === "note-delete") {
              const id = rec.url.split("?")[0].split("/").pop();
              if (id) list = list.filter((n) => n._id !== id);
            }
          }
          return list;
        });
      });
    };
    sync();
    window.addEventListener(OUTBOX_CHANGED, sync);
    window.addEventListener(OUTBOX_DRAINED, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(OUTBOX_CHANGED, sync);
      window.removeEventListener(OUTBOX_DRAINED, sync);
    };
  }, []);

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
          description="Jot anything down — a checklist, an idea, a plan. Just start typing; use the toolbar for headings, bullets, and checkboxes."
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
              <Card className="h-full transition-colors hover:bg-surface-2">
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
