"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { Modal } from "./modal";
import { TaskForm } from "./task-form";
import { emitTaskCreated } from "@/lib/task-events";

export function NewTaskButton({
  variant = "primary",
  label = "New task",
  categories = [],
  className = "h-11 px-6",
}: {
  variant?: "primary" | "secondary";
  label?: string;
  /** Existing category names to offer in the task form's dropdown. */
  categories?: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        + {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New task">
        <TaskForm
          categories={categories}
          onCancel={() => setOpen(false)}
          onCreated={(task) => {
            setOpen(false);
            // Show the new row instantly: the table splices in this task from the
            // broadcast, then the non-blocking refresh reconciles the full list.
            emitTaskCreated(task);
            startTransition(() => router.refresh());
          }}
        />
      </Modal>
    </>
  );
}
