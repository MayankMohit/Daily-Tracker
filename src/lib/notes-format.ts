// Markdown ⇄ DOM helpers for the native (WYSIWYG) note editor.
//
// Notes are still *stored* as the same little markdown dialect the read-only
// renderer understands (`#`/`##`/`###`, `- ` bullets, `- [ ]`/`- [x]` checks,
// inline `**bold**`, `*italic*`, `` `code` ``). The editor never shows that
// syntax though: it renders each source line as an editable "block" element and
// serialises the blocks back to markdown on save. Keeping the storage format
// means existing notes, the API, and the card previews all keep working
// unchanged — only the editing surface became WYSIWYG.

/** The block types the editor renders. Mirrors the markdown line kinds. */
export type BlockType = "p" | "h1" | "h2" | "h3" | "bullet" | "check" | "check-done";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Classify one markdown source line into a block type + its text content. */
function parseLine(line: string): { type: BlockType; text: string } {
  const heading = line.match(/^(#{1,3})\s+(.*)$/);
  if (heading) {
    const level = heading[1].length as 1 | 2 | 3;
    return { type: `h${level}` as BlockType, text: heading[2] };
  }
  const done = line.match(/^\s*-\s\[x\]\s?(.*)$/i);
  if (done) return { type: "check-done", text: done[1] };
  const todo = line.match(/^\s*-\s\[ \]\s?(.*)$/);
  if (todo) return { type: "check", text: todo[1] };
  const bullet = line.match(/^\s*[-*]\s+(.*)$/);
  if (bullet) return { type: "bullet", text: bullet[1] };
  return { type: "p", text: line };
}

// Inline emphasis → HTML. Same precedence as the read-only renderer: bold before
// italic so `**x**` binds as bold, non-greedy bodies so a span may hold a stray
// `*`. Text segments are escaped; an empty block yields a bare <br> so it keeps
// height and can hold the caret.
function inlineToHtml(text: string): string {
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[1] !== undefined) out += `<strong>${escapeHtml(m[1])}</strong>`;
    else if (m[2] !== undefined) out += `<em>${escapeHtml(m[2])}</em>`;
    else if (m[3] !== undefined) out += `<code>${escapeHtml(m[3])}</code>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out || "<br>";
}

/** Build the editor's initial innerHTML from a note's markdown body. */
export function markdownToEditorHtml(md: string): string {
  const lines = md.length ? md.split("\n") : [""];
  return lines
    .map((line) => {
      const { type, text } = parseLine(line);
      return `<div class="note-block" data-type="${type}">${inlineToHtml(text)}</div>`;
    })
    .join("");
}

// Walk a block's inline children back into markdown. Known emphasis tags become
// their markers; anything else (e.g. a stray <span> the browser inserted) simply
// contributes its text, so foreign formatting can never leak into storage.
function serializeInline(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.nodeValue ?? "";
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return; // trailing <br> in an otherwise-empty block
    const inner = serializeInline(el);
    if (inner === "") return; // drop empty emphasis so it can't produce `****`
    if (tag === "strong" || tag === "b") out += `**${inner}**`;
    else if (tag === "em" || tag === "i") out += `*${inner}*`;
    else if (tag === "code") out += `\`${inner}\``;
    else out += inner;
  });
  return out;
}

const PREFIX: Record<BlockType, string> = {
  p: "",
  h1: "# ",
  h2: "## ",
  h3: "### ",
  bullet: "- ",
  check: "- [ ] ",
  "check-done": "- [x] ",
};

/** Serialise the editor's top-level blocks back into a markdown body. Robust to
 *  stray top-level nodes: a bare element/text node the browser may leave behind
 *  is treated as a plain paragraph rather than dropped. */
export function editorToMarkdown(root: HTMLElement): string {
  const out: string[] = [];
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.nodeValue ?? "";
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const type = (el.getAttribute("data-type") as BlockType | null) ?? "p";
    out.push((PREFIX[type] ?? "") + serializeInline(el));
  });
  return out.join("\n");
}
