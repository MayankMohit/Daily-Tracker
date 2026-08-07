"use client";

// Native (WYSIWYG) note editor. You just type and see formatted text — headings,
// bullets, and real tickable checkboxes render live, so there's no raw markdown
// (`**`, `- [ ]`, `##`) to learn. Under the hood the content is still stored as
// the same markdown dialect (see lib/notes-format), so existing notes, the API,
// and the card previews are untouched.
//
// The editable surface is an *uncontrolled* contentEditable: React seeds its HTML
// once on mount and then leaves the DOM alone (rebuilding innerHTML on every
// keystroke would fight the caret). Toolbar actions, Enter, and checkbox toggles
// mutate the DOM directly; we only read it back to markdown when saving.

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Note } from "@/lib/types";
import { Button, inputClass } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/cn";
import { markdownToEditorHtml, editorToMarkdown, type BlockType } from "@/lib/notes-format";

type Status = "idle" | "saving" | "saved" | "error";

export function NoteEditor({
  note,
  taskId,
  autoFocus,
  onSaved,
  onDeleted,
}: {
  note?: Note;
  /** When creating a note attached to a task, the task to attach it to. */
  taskId?: string;
  autoFocus?: boolean;
  onSaved?: (note: Note) => void;
  onDeleted?: (id: string) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Refs, not state, drive saving — they update synchronously, so rapid edits
  // (type → tick a box → blur) all see the freshest note id/title and never race
  // into duplicate notes:
  //   currentRef  the saved note (its _id lets follow-up saves *update*, not create)
  //   titleRef    latest title, readable mid-flight without waiting for a re-render
  //   savingRef   a POST is in flight; pendingRef marks "another edit arrived, save
  //               once more after" so concurrent saves collapse into one update
  //   discardRef  the note is being deleted; suppress any pending/blur save
  //   saveTimer   the debounce handle for autosave-after-you-stop-typing
  const currentRef = useRef<Note | undefined>(note);
  const titleRef = useRef(note?.title ?? "");
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const discardRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save() {
    if (discardRef.current) return; // being deleted — don't resurrect it
    const el = editorRef.current;
    const body = el ? editorToMarkdown(el) : "";
    const t = titleRef.current;
    if (!body.trim() && !t.trim()) return; // nothing worth saving
    const cur = currentRef.current;
    if (cur && cur.body === body && (cur.title ?? "") === t.trim()) return; // unchanged
    if (savingRef.current) {
      pendingRef.current = true; // coalesce: fold this into the in-flight save
      return;
    }
    savingRef.current = true;
    setStatus("saving");
    try {
      const saved = await api.post<Note>("/api/notes", {
        id: cur?._id,
        taskId: cur?.taskId ?? taskId,
        title: t,
        body,
      });
      // Deleted while this create was in flight → undo it so no orphan lingers.
      if (discardRef.current) {
        try {
          await api.del(`/api/notes/${saved._id}`);
        } catch {
          /* best effort */
        }
        return;
      }
      currentRef.current = saved;
      setStatus("saved");
      onSaved?.(saved);
    } catch {
      setStatus("error");
    } finally {
      savingRef.current = false;
      // An edit landed mid-flight — save once more, now with the id in hand.
      if (pendingRef.current && !discardRef.current) {
        pendingRef.current = false;
        void save();
      }
    }
  }

  // Autosave after the user pauses typing; flushSave runs it now (blur, ticking a
  // box, Save button) and cancels any pending debounce first.
  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save();
    }, 700);
  }
  function flushSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    void save();
  }

  // Keep a ref to the latest save so the unmount cleanup can flush it without
  // stale closures — closing the modal mid-edit still persists your text.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Seed the editable surface once from the note's markdown. The modal remounts
  // this component per note, so a mount effect is enough. execCommand emits plain
  // tags (not inline styles) once styleWithCSS is off — keeps bold/italic
  // serialisable back to `**`/`*`.
  useEffect(() => {
    const el = editorRef.current;
    if (el) el.innerHTML = markdownToEditorHtml(note?.body ?? "");
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // Non-fatal: a browser without execCommand just yields no live bold/italic.
    }
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveRef.current(); // flush a pending edit on close
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Delete button's mousedown sets this *before* the editor's blur fires, so
  // the blur-save is suppressed and a brand-new note is never created just to be
  // deleted. A cancel re-enables saving.
  function beginDelete() {
    discardRef.current = true;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }

  function requestDelete() {
    if (!currentRef.current) {
      onDeleted?.(""); // never saved — nothing on the server to remove
      return;
    }
    setConfirmDelete(true);
  }

  function cancelDelete() {
    setConfirmDelete(false);
    discardRef.current = false; // resume saving
  }

  async function remove() {
    setConfirmDelete(false);
    const cur = currentRef.current;
    if (!cur) return;
    try {
      await api.del(`/api/notes/${cur._id}`);
      onDeleted?.(cur._id);
    } catch {
      setStatus("error");
    }
  }

  // ── selection helpers ──────────────────────────────────────────────────────
  function currentBlock(): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let n: Node | null = sel.getRangeAt(0).startContainer;
    while (n && n !== editorRef.current) {
      if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).classList?.contains("note-block"))
        return n as HTMLElement;
      n = n.parentNode;
    }
    return null;
  }

  // Blocks touched by the current selection (falls back to the caret's block).
  function selectedBlocks(): HTMLElement[] {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const blocks = Array.from(el.querySelectorAll<HTMLElement>(".note-block")).filter((b) =>
      range.intersectsNode(b),
    );
    if (blocks.length) return blocks;
    const b = currentBlock();
    return b ? [b] : [];
  }

  function placeCaretAtStart(node: Node) {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.setStart(node, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // ── toolbar actions ────────────────────────────────────────────────────────
  // Inline bold/italic via execCommand: it handles toggling and partial/multi-
  // node selections natively. Deprecated but universally supported, and with
  // styleWithCSS off it emits <b>/<i>, which serialise cleanly.
  function inline(command: "bold" | "italic") {
    editorRef.current?.focus();
    try {
      document.execCommand(command);
    } catch {
      /* no-op if unsupported */
    }
    scheduleSave();
  }

  // Toggle a block-level type on every selected block: applying the type again
  // reverts to a plain paragraph, so each toolbar button is its own on/off.
  function toggleBlock(type: Exclude<BlockType, "check-done">) {
    const blocks = selectedBlocks();
    if (!blocks.length) return;
    // If every block is already this type, turn them all off; otherwise turn on.
    const allOn = blocks.every((b) => {
      const cur = b.getAttribute("data-type");
      return type === "check" ? cur === "check" || cur === "check-done" : cur === type;
    });
    for (const b of blocks) b.setAttribute("data-type", allOn ? "p" : type);
    editorRef.current?.focus();
    scheduleSave();
  }

  // ── key handling ───────────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnter();
    } else if (e.key === "Backspace") {
      handleBackspace(e);
    } else if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      inline("bold");
    } else if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      inline("italic");
    }
  }

  // Enter splits the current block at the caret. Lists continue with a fresh
  // (unchecked) item; pressing Enter on an *empty* list/heading item drops back
  // to a plain paragraph instead — matching how most note apps let you exit a
  // list. Shift+Enter falls through to the browser for a soft line break.
  function handleEnter() {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const block = currentBlock();
    if (!block) return;
    const type = (block.getAttribute("data-type") as BlockType) || "p";
    const isList = type === "bullet" || type === "check" || type === "check-done";

    const range = sel.getRangeAt(0);
    range.deleteContents();

    if ((isList || type.startsWith("h")) && block.textContent?.trim() === "") {
      // Empty list item / heading → become a paragraph and stop.
      block.setAttribute("data-type", "p");
      if (!block.firstChild) block.appendChild(document.createElement("br"));
      placeCaretAtStart(block);
      scheduleSave();
      return;
    }

    // Move everything from the caret to the end of the block into a new sibling.
    const after = range.cloneRange();
    after.setStart(range.endContainer, range.endOffset);
    after.setEnd(block, block.childNodes.length);
    const frag = after.extractContents();

    // Headings and paragraphs continue as paragraphs; a done check continues
    // as an unchecked one; other lists continue as themselves.
    const nextType: BlockType =
      type === "bullet" ? "bullet" : type === "check" || type === "check-done" ? "check" : "p";

    const nb = document.createElement("div");
    nb.className = "note-block";
    nb.setAttribute("data-type", nextType);
    nb.appendChild(frag);
    if (!nb.textContent) nb.appendChild(document.createElement("br"));
    if (!block.textContent) {
      block.textContent = "";
      block.appendChild(document.createElement("br"));
    }
    block.after(nb);
    placeCaretAtStart(nb);
    scheduleSave();
  }

  // Backspace at the very start of a non-paragraph block clears its type (exit
  // the list / un-heading) rather than merging into the block above.
  function handleBackspace(e: React.KeyboardEvent<HTMLDivElement>) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const block = currentBlock();
    if (!block) return;
    const type = block.getAttribute("data-type");
    if (!type || type === "p") return;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(block);
    pre.setEnd(range.startContainer, range.startOffset);
    if (pre.toString() === "") {
      e.preventDefault();
      block.setAttribute("data-type", "p");
      scheduleSave();
    }
  }

  // Tick/untick a checklist item by clicking its box (the left gutter). Saves at
  // once, like a discrete action, so a check survives even if the modal closes
  // before the editor blurs.
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const block = (e.target as HTMLElement).closest?.(".note-block") as HTMLElement | null;
    if (!block) return;
    const type = block.getAttribute("data-type");
    if (type !== "check" && type !== "check-done") return;
    const rect = block.getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(block).paddingLeft) || 24;
    if (e.clientX - rect.left <= gutter) {
      block.setAttribute("data-type", type === "check" ? "check-done" : "check");
      flushSave(); // discrete action — persist the tick right away
    }
  }

  // Paste as plain text so foreign fonts/colours never enter a note. Newlines
  // become fresh paragraphs; a single line is inserted inline at the caret.
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData?.getData("text/plain");
    if (text === undefined) return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const parts = text.split(/\r?\n/);
    const block = currentBlock();
    if (!block || parts.length === 1) {
      const node = document.createTextNode(parts.join("\n"));
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const after = range.cloneRange();
      after.setStart(range.endContainer, range.endOffset);
      after.setEnd(block, block.childNodes.length);
      const tail = after.extractContents();
      range.insertNode(document.createTextNode(parts[0]));
      let anchor = block;
      for (let i = 1; i < parts.length; i++) {
        const nb = document.createElement("div");
        nb.className = "note-block";
        nb.setAttribute("data-type", "p");
        nb.textContent = parts[i];
        if (!nb.textContent) nb.appendChild(document.createElement("br"));
        anchor.after(nb);
        anchor = nb;
      }
      if (tail.textContent) anchor.appendChild(tail);
      placeCaretAtStart(anchor.lastChild ?? anchor);
    }
    scheduleSave();
  }

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Save failed"
          : "";

  return (
    <div className="space-y-2">
      <input
        className={cn(inputClass, "font-medium")}
        placeholder="Note title (optional)"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          titleRef.current = e.target.value;
          scheduleSave();
        }}
        onBlur={flushSave}
        autoFocus={autoFocus}
      />

      {/* Formatting toolbar. mousedown-preventDefault keeps the editor's selection
          intact so each action applies to what's actually selected. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <ToolButton label="Bold" onAction={() => inline("bold")}>
            <span className="font-bold">B</span>
          </ToolButton>
          <ToolButton label="Italic" onAction={() => inline("italic")}>
            <span className="italic">I</span>
          </ToolButton>
          <ToolButton label="Heading" onAction={() => toggleBlock("h2")}>
            H
          </ToolButton>
          <ToolButton label="Bullet list" onAction={() => toggleBlock("bullet")}>
            •
          </ToolButton>
          <ToolButton label="Checklist" onAction={() => toggleBlock("check")}>
            ☑
          </ToolButton>
        </div>
        <span className="text-xs text-muted">{statusLabel}</span>
      </div>

      <div
        ref={editorRef}
        className="note-rich min-h-72 rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed focus:border-foreground/40 focus:outline-none"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Note body"
        onInput={scheduleSave}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onPaste={onPaste}
        onBlur={flushSave}
      />

      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          // mousedown fires before the editor's blur, so the pending/blur save is
          // suppressed and deleting a never-saved note can't create one first.
          onMouseDown={beginDelete}
          onClick={requestDelete}
        >
          Delete
        </Button>
        <Button size="sm" onClick={flushSave}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={cancelDelete}
        onConfirm={remove}
        title="Delete note?"
        message="Delete this note? This can't be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function ToolButton({
  label,
  onAction,
  children,
}: {
  label: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Run on mousedown and prevent default so the editor keeps focus and its
      // text selection — a click would blur/collapse it first.
      onMouseDown={(e) => {
        e.preventDefault();
        onAction();
      }}
      className="grid h-7 w-8 place-items-center rounded border border-border text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {children}
    </button>
  );
}
