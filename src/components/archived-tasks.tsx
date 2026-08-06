"use client";

// Settings card listing soft-archived tasks (active === false) with a way to
// bring them back. Archiving keeps a task's history but hides it from the
// dashboard; restoring is just a PATCH flipping `active` back to true. Permanent
// deletion (history and all) is also offered here, behind a confirm dialog.
//
// Seeded from the server (SSR) and updated optimistically: a restored/deleted row
// leaves the list on the same tick, then a background refresh reconciles the rest
// of the app (the dashboard table, analytics) with the change.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/types";
import { api } from "@/lib/client";
import { Card, Button } from "./ui";
import { ConfirmDialog } from "./confirm-dialog";

export function ArchivedTasks({ initial }: { initial: Task[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const confirmTask = tasks.find((t) => t._id === confirmId) ?? null;

  async function restore(id: string) {
    const prev = tasks;
    setPendingId(id);
    setTasks((list) => list.filter((t) => t._id !== id));
    try {
      await api.patch(`/api/tasks/${id}`, { active: true });
      // Refresh so the restored task reappears on the dashboard / in analytics.
      router.refresh();
    } catch {
      setTasks(prev); // restore didn't stick — put the row back
    } finally {
      setPendingId(null);
    }
  }

  async function remove(id: string) {
    const prev = tasks;
    setConfirmId(null);
    setPendingId(id);
    setTasks((list) => list.filter((t) => t._id !== id));
    try {
      await api.del(`/api/tasks/${id}?hard=1`);
      router.refresh();
    } catch {
      setTasks(prev); // deletion failed — put the row back
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Archived tasks</h3>
        <p className="text-xs text-muted">
          Archived tasks are hidden from the dashboard but keep their history.
          Restore one to bring it back.
        </p>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
          No archived tasks.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {tasks.map((task) => (
            <li
              key={task._id}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {task.color && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: task.color }}
                    />
                  )}
                  <span className="truncate text-sm font-medium">
                    {task.title}
                  </span>
                </div>
                {(task.category || task.goal === "avoid") && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {task.category && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5">
                        {task.category}
                      </span>
                    )}
                    {task.goal === "avoid" && <span>avoid</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restore(task._id)}
                  disabled={pendingId === task._id}
                >
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmId(task._id)}
                  disabled={pendingId === task._id}
                  className="text-muted hover:text-danger"
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && remove(confirmId)}
        title="Delete task?"
        message={
          <>
            Permanently delete{" "}
            <span className="font-medium text-foreground">
              {confirmTask?.title}
            </span>{" "}
            and all its history? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        danger
      />
    </Card>
  );
}
