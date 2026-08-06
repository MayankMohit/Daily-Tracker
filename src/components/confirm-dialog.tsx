"use client";

// A themed replacement for the browser's native window.confirm(): a small modal
// with a message and Cancel / Confirm buttons, built on the shared <Modal> (so it
// gets the same backdrop, Escape-to-close, and portal behaviour as every other
// dialog). Use `danger` for destructive actions to render a solid red confirm
// button. Controlled — the caller owns the `open` state and the two callbacks.

import { Modal } from "./modal";
import { Button } from "./ui";
import { cn } from "@/lib/cn";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Body text (or richer nodes) explaining the consequence. */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as a solid destructive action. */
  danger?: boolean;
  /** Disable both buttons while the action is in flight. */
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-5">
        {message && (
          <div className="text-sm leading-relaxed text-muted">{message}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              danger &&
                "bg-danger text-white shadow-sm hover:bg-danger hover:opacity-90",
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
