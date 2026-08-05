"use client";

// Suppresses the browser's default right-click menu app-wide.
//
// Editable surfaces are exempted (text inputs, textareas, and anything inside a
// contentEditable region — e.g. the note editor) so users keep native
// paste/spellcheck/select-all there. Everything else falls through to
// preventDefault. Headless component, mirrors TimezoneSync / ServiceWorkerRegister.

import { useEffect } from "react";

/** True when the event originated inside a field where the native menu is useful. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
    ),
  );
}

export function NoContextMenu() {
  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    }
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  return null;
}
