"use client";

// A tiny, dependency-free markdown renderer for the notes feature. It supports
// only the subset the editor produces: `#`/`##`/`###` headings, `- ` bullets,
// `- [ ]`/`- [x]` checklists, and inline `**bold**`, `*italic*`, `` `code` ``.
// Checklists can be made interactive by passing `onToggle` (used in the editor's
// preview); clicking a box calls back with the source line index to flip it.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const CHECK_UNCHECKED = /^\s*-\s\[ \]\s?/;
const CHECK_CHECKED = /^\s*-\s\[x\]\s?/i;
const BULLET = /^\s*[-*]\s+/;
const HEADING = /^(#{1,3})\s+/;

/** Flip `- [ ]` ↔ `- [x]` on the given source line; returns the new full body. */
export function toggleChecklistLine(body: string, lineIndex: number): string {
  const lines = body.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return body;
  if (CHECK_CHECKED.test(line)) {
    lines[lineIndex] = line.replace(/\[x\]/i, "[ ]");
  } else if (CHECK_UNCHECKED.test(line)) {
    lines[lineIndex] = line.replace("[ ]", "[x]");
  }
  return lines.join("\n");
}

// Inline emphasis. Bold is tried before italic so `**x**` binds as bold, and
// each uses a non-greedy body (`.+?`) so the emphasized span may itself contain
// a stray `*` (e.g. `**a * b**`) — the old `[^*]+` bodies made those render
// literally. Parsing is per line, so an unclosed `**`/`*` stays as plain text.
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] !== undefined)
      nodes.push(
        <code
          key={key++}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {m[3]}
        </code>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function NoteMarkdown({
  body,
  onToggle,
  className,
}: {
  body: string;
  /** When provided, checklist boxes are interactive and call back with the
   *  source line index. Omit for a read-only render. */
  onToggle?: (lineIndex: number) => void;
  className?: string;
}) {
  const lines = body.split("\n");
  return (
    <div className={cn("space-y-1 text-sm leading-relaxed", className)}>
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-2" aria-hidden />;

        const heading = line.match(HEADING);
        if (heading) {
          const level = heading[1].length;
          const text = line.slice(heading[0].length);
          const cls =
            level === 1
              ? "text-base font-semibold"
              : level === 2
                ? "text-sm font-semibold"
                : "text-sm font-medium text-muted";
          return (
            <p key={i} className={cn("pt-1", cls)}>
              {renderInline(text)}
            </p>
          );
        }

        const checked = CHECK_CHECKED.test(line);
        const unchecked = CHECK_UNCHECKED.test(line);
        if (checked || unchecked) {
          const text = line.replace(checked ? CHECK_CHECKED : CHECK_UNCHECKED, "");
          return (
            <label
              key={i}
              className={cn(
                "flex items-start gap-2",
                onToggle ? "cursor-pointer" : "cursor-default",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!onToggle}
                onChange={() => onToggle?.(i)}
                className="mt-0.5"
              />
              <span className={cn(checked && "text-muted line-through")}>
                {renderInline(text)}
              </span>
            </label>
          );
        }

        if (BULLET.test(line)) {
          const text = line.replace(BULLET, "");
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{renderInline(text)}</span>
            </div>
          );
        }

        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}
