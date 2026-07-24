"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { Modal } from "./modal";
import { TaskForm } from "./task-form";

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
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}
