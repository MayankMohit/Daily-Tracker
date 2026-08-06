"use client";

// Lightweight, dependency-free note editor: a markdown <textarea> with a small
// formatting toolbar (bold/italic/heading/bullet/checklist) and a live Preview
// tab whose checklists are interactive. Autosaves on blur (like the journal box)
// and immediately when a preview checkbox is toggled. A new note is created on
// its first save; subsequent saves update it in place.

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Note } from "@/lib/types";
import { Button, inputClass } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/cn";
import { NoteMarkdown, toggleChecklistLine } from "./note-markdown";

type Status = "idle" | "saving" | "saved" | "error";

// Splits a line into its leading list/heading marker (kept outside emphasis) and
// the text content that emphasis should wrap.
const LINE_PREFIX = /^(\s*(?:- \[[ xX]\] |[-*] |#{1,3} )?)(.*)$/;

// True when `content` is already wrapped in `marker` (so a toggle should strip it).
function isEmphasised(content: string, marker: string): boolean {
  const m = marker.length;
  if (content.length < 2 * m) return false;
  if (!content.startsWith(marker) || !content.endsWith(marker)) return false;
  // Don't let italic (*) treat bold (**) text as its own wrapper.
  if (marker === "*" && (content.startsWith("**") || content.endsWith("**")))
    return false;
  return true;
}

// Add the marker, or strip it if already present (toggle).
function toggleEmphasis(content: string, marker: string): string {
  return isEmphasised(content, marker)
    ? content.slice(marker.length, content.length - marker.length)
    : marker + content + marker;
}

export function NoteEditor({
  note,
  taskId,
  autoFocus,
  onSaved,
  onDeleted,
}: {
  note?: Note;
  /** When creating a standalone-vs-attached note, the task to attach it to. */
  taskId?: string;
  autoFocus?: boolean;
  onSaved?: (note: Note) => void;
  onDeleted?: (id: string) => void;
}) {
  const [current, setCurrent] = useState<Note | undefined>(note);
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [status, setStatus] = useState<Status>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  async function save(nextBody = body, nextTitle = title) {
    if (!nextBody.trim() && !nextTitle.trim()) return; // nothing worth saving
    // Skip a redundant save when nothing actually changed.
    if (current && current.body === nextBody && (current.title ?? "") === nextTitle.trim())
      return;
    setStatus("saving");
    try {
      const saved = await api.post<Note>("/api/notes", {
        id: current?._id,
        taskId: current?.taskId ?? taskId,
        title: nextTitle,
        body: nextBody,
      });
      setCurrent(saved);
      setStatus("saved");
      onSaved?.(saved);
    } catch {
      setStatus("error");
    }
  }

  // The Delete button: an unsaved note has nothing to confirm — just clear it.
  // A saved note opens a confirmation dialog first.
  function requestDelete() {
    if (!current) {
      onDeleted?.("");
      return;
    }
    setConfirmDelete(true);
  }

  async function remove() {
    setConfirmDelete(false);
    if (!current) return;
    try {
      await api.del(`/api/notes/${current._id}`);
      onDeleted?.(current._id);
    } catch {
      setStatus("error");
    }
  }

  function handleToggle(lineIndex: number) {
    const next = toggleChecklistLine(body, lineIndex);
    setBody(next);
    save(next, title);
  }

  // --- toolbar helpers: operate on the textarea's current selection ---
  // Apply an inline marker (`**` bold / `*` italic) to the selection, keeping any
  // list/heading marker outside the emphasis and *toggling* — if the text is
  // already emphasised it strips the marker instead of nesting another.
  // A multi-line selection acts per line: if every non-blank line is already
  // emphasised it removes it from all, otherwise it emphasises the ones that
  // aren't (emphasis binds per line, so a single `**` around the block wouldn't
  // render).
  function wrapSelection(marker: string) {
    const ta = areaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const selected = body.slice(s, e);

    if (selected.includes("\n")) {
      const blockStart = body.lastIndexOf("\n", s - 1) + 1;
      const searchFrom = e > s && body[e - 1] === "\n" ? e - 1 : e;
      let blockEnd = body.indexOf("\n", searchFrom);
      if (blockEnd === -1) blockEnd = body.length;
      const parsed = body
        .slice(blockStart, blockEnd)
        .split("\n")
        .map((line) => {
          const mk = line.match(LINE_PREFIX);
          return { prefix: mk ? mk[1] : "", content: mk ? mk[2] : line };
        });
      const nonBlank = parsed.filter((p) => p.content.trim() !== "");
      const allOn =
        nonBlank.length > 0 && nonBlank.every((p) => isEmphasised(p.content, marker));
      const wrapped = parsed
        .map((p) => {
          if (p.content.trim() === "") return p.prefix + p.content; // blank line
          const next = allOn
            ? p.content.slice(marker.length, p.content.length - marker.length)
            : isEmphasised(p.content, marker)
              ? p.content // already on in a mixed selection — leave it
              : marker + p.content + marker;
          return p.prefix + next;
        })
        .join("\n");
      const nextBody = body.slice(0, blockStart) + wrapped + body.slice(blockEnd);
      setBody(nextBody);
      const end = blockStart + wrapped.length;
      queueMicrotask(() => {
        ta.focus();
        ta.setSelectionRange(blockStart, end);
      });
      return;
    }

    // No selection: drop in the marker with a placeholder to type over.
    if (selected === "") {
      const inner = "text";
      const nextBody = body.slice(0, s) + marker + inner + marker + body.slice(e);
      setBody(nextBody);
      queueMicrotask(() => {
        ta.focus();
        ta.setSelectionRange(s + marker.length, s + marker.length + inner.length);
      });
      return;
    }

    // Single-line selection: keep any leading list/heading marker outside.
    const mk = selected.match(LINE_PREFIX);
    const prefix = mk ? mk[1] : "";
    const content = mk ? mk[2] : selected;
    const replaced = prefix + toggleEmphasis(content, marker);
    const nextBody = body.slice(0, s) + replaced + body.slice(e);
    setBody(nextBody);
    queueMicrotask(() => {
      ta.focus();
      ta.setSelectionRange(s, s + replaced.length);
    });
  }

  // Enter inside a checklist/bullet line continues the list: a new line gets the
  // same marker (checklists always continue unchecked). Pressing Enter on an
  // empty item instead clears the marker, so you exit the list — matching how
  // most note apps behave. Shift+Enter always inserts a plain newline.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const ta = areaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: eSel } = ta;
    if (s !== eSel) return; // leave range-selection + Enter to the browser
    const lineStart = body.lastIndexOf("\n", s - 1) + 1;
    const line = body.slice(lineStart, s);
    const check = line.match(/^(\s*)- \[[ xX]\] /);
    const bullet = check ? null : line.match(/^(\s*)([-*]) /);
    const marker = check ?? bullet;
    if (!marker) return; // not in a list — default behaviour

    e.preventDefault();
    const content = line.slice(marker[0].length);
    if (content.trim() === "") {
      // Empty item → drop the marker and exit the list.
      const next = body.slice(0, lineStart) + body.slice(s);
      setBody(next);
      queueMicrotask(() => {
        ta.focus();
        ta.setSelectionRange(lineStart, lineStart);
      });
      return;
    }
    const cont = check ? `${check[1]}- [ ] ` : `${bullet![1]}${bullet![2]} `;
    const insert = "\n" + cont;
    const next = body.slice(0, s) + insert + body.slice(eSel);
    setBody(next);
    const caret = s + insert.length;
    queueMicrotask(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  function prefixLines(prefix: string) {
    const ta = areaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const start = body.lastIndexOf("\n", s - 1) + 1;
    const end = body.indexOf("\n", e);
    const stop = end === -1 ? body.length : end;
    const block = body.slice(start, stop);
    const next =
      body.slice(0, start) +
      block
        .split("\n")
        .map((l) => (l.startsWith(prefix) ? l : prefix + l))
        .join("\n") +
      body.slice(stop);
    setBody(next);
    queueMicrotask(() => ta.focus());
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
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => save()}
        autoFocus={autoFocus}
      />

      {/* Tabs + toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (t === "preview") save();
                setTab(t);
              }}
              className={cn(
                "rounded px-2 py-1 capitalize transition-colors",
                tab === t
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{statusLabel}</span>
      </div>

      {tab === "write" ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            <ToolButton label="Bold" onClick={() => wrapSelection("**")}>
              <span className="font-bold">B</span>
            </ToolButton>
            <ToolButton label="Italic" onClick={() => wrapSelection("*")}>
              <span className="italic">I</span>
            </ToolButton>
            <ToolButton label="Heading" onClick={() => prefixLines("## ")}>
              H
            </ToolButton>
            <ToolButton label="Bullet list" onClick={() => prefixLines("- ")}>
              •
            </ToolButton>
            <ToolButton label="Checklist" onClick={() => prefixLines("- [ ] ")}>
              ☑
            </ToolButton>
          </div>
          <textarea
            ref={areaRef}
            className={cn(inputClass, "h-[55vh] min-h-72 resize-y py-2 font-mono text-sm leading-relaxed")}
            placeholder={"Write here…\n\n- [ ] a checklist item\n- a bullet\n**bold**, *italic*"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => save()}
          />
        </div>
      ) : (
        <div className="min-h-72 rounded-md border border-border bg-surface px-3 py-2">
          {body.trim() ? (
            <NoteMarkdown body={body} onToggle={handleToggle} />
          ) : (
            <p className="text-sm text-muted">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={requestDelete}>
          Delete
        </Button>
        <Button size="sm" onClick={() => save()}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
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
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-7 w-8 place-items-center rounded border border-border text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {children}
    </button>
  );
}
