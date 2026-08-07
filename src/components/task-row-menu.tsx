"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/types";
import type { TaskInput } from "@/lib/schemas";
import { api } from "@/lib/client";
import { cn } from "@/lib/cn";
import { Modal } from "./modal";
import { ConfirmDialog } from "./confirm-dialog";
import { TaskForm } from "./task-form";
import { TaskNotes } from "./notes/task-notes";

export function TaskRowMenu({
  task,
  categories = [],
  onChanged,
  onOptimisticUpsert,
  onOptimisticRemove,
  noteCount = 0,
  onNoteCountChange,
}: {
  task: Task;
  /** Existing category names offered as suggestions in the edit form. */
  categories?: string[];
  onChanged: () => void;
  /** Reflect an edit in the parent table immediately (before the refresh). */
  onOptimisticUpsert?: (task: Task) => void;
  /** Drop the row from the parent table immediately (before the refresh). */
  onOptimisticRemove?: (taskId: string) => void;
  /** Number of notes attached to this task, shown as a badge. */
  noteCount?: number;
  /** Notified when the count changes (note added/removed in the dialog). */
  onNoteCountChange?: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The menu is rendered as a fixed overlay (not an absolute child) so the
  // table's horizontal scroll container can't clip it. We measure the trigger
  // on open and anchor the menu to its bottom-right corner.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r)
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onScrollOrResize);
    // Any scroll invalidates the measured position — just close.
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  async function archive() {
    // Drop the row now; the delete runs in the background. On success we refresh
    // to reconcile, and on failure we also refresh — pulling the task back from
    // the server since the optimistic removal didn't stick.
    setOpen(false);
    onOptimisticRemove?.(task._id);
    try {
      await api.del(`/api/tasks/${task._id}`);
    } finally {
      onChanged();
    }
  }

  async function remove() {
    setConfirmDelete(false);
    onOptimisticRemove?.(task._id);
    try {
      await api.del(`/api/tasks/${task._id}?hard=1`);
    } finally {
      onChanged();
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {noteCount > 0 && (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          title={`${noteCount} note${noteCount === 1 ? "" : "s"}`}
          aria-label={`${noteCount} note${noteCount === 1 ? "" : "s"} — open notes`}
          className="flex h-6 shrink-0 items-center gap-0.5 rounded px-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <NoteIcon className="h-3.5 w-3.5" />
          <span className="text-xs tabular-nums">{noteCount}</span>
        </button>
      )}
      <button
        ref={btnRef}
        type="button"
        aria-label="Task options"
        onClick={toggle}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted opacity-100 transition-opacity hover:bg-surface-2 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 aria-expanded:opacity-100"
        aria-expanded={open}
      >
        ⋯
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[60] w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
            style={{ top: pos.top, right: pos.right }}
          >
            <MenuItem
              onClick={() => {
                setOpen(false);
                setEditing(true);
              }}
            >
              Edit task
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false);
                setNotesOpen(true);
              }}
            >
              Notes
            </MenuItem>
            <MenuItem onClick={archive}>Archive</MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false);
                setConfirmDelete(true);
              }}
              danger
            >
              Delete permanently
            </MenuItem>
          </div>,
          document.body,
        )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit task"
      >
        <TaskForm
          taskId={task._id}
          initial={taskToInput(task)}
          categories={categories}
          onCancel={() => setEditing(false)}
          onCreated={(saved) => {
            setEditing(false);
            // Reflect the edit in the row instantly, then reconcile via refresh.
            onOptimisticUpsert?.(saved);
            onChanged();
          }}
        />
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete task?"
        message={
          <>
            Delete <span className="font-medium text-foreground">{task.title}</span>{" "}
            and all its history? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        danger
      />

      <Modal
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title={`Notes · ${task.title}`}
      >
        <TaskNotes taskId={task._id} onCountChange={onNoteCountChange} />
      </Modal>
    </div>
  );
}

// Map a stored Task onto the form's initial-values shape.
function taskToInput(task: Task): Partial<TaskInput> {
  return {
    title: task.title,
    description: task.description,
    type: task.type,
    goal: task.goal,
    percentageConfig: task.percentageConfig,
    category: task.category,
    priority: task.priority,
    estimatedDuration: task.estimatedDuration,
    recurrence: task.recurrence,
    recurrenceDays: task.recurrenceDays,
    startDate: task.startDate,
    endDate: task.endDate,
    reminder: task.reminder,
    color: task.color,
  } as Partial<TaskInput>;
}

// A small document/note glyph (currentColor) for the row's note-count badge.
function NoteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4 4h11l5 5v11a0 0 0 0 1 0 0H4a0 0 0 0 1 0 0z" />
      <path d="M14 4v5h5" />
      <path d="M8 13h6M8 17h4" />
    </svg>
  );
}

function MenuItem({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "block w-full px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-50",
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-foreground hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
