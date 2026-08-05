# LockedIn — Feature Batch Plan

## Context

Seven improvements requested for the daily-tracker app, spanning abuse-prevention,
scheduling UX, a new Notes entity, perceived performance, and interaction polish.
Exploration showed the codebase is well-positioned: a full recurrence/date-range
model already exists (just not exposed in the UI), mutations already have an
optimistic pattern (just not used everywhere), and the store adds new collections
lazily by name. So most of this is filling gaps in existing systems rather than
new infrastructure.

**Confirmed decisions (from the user):**
- Notes editor: **lightweight, no new dependency** (custom contentEditable/markdown, styled with existing tokens).
- Standalone notes: **new `/notes` page in the nav**; notes are also attachable to tasks.
- Rate limiting: **AI hardening + a general per-user throttle across all `/api` routes**.
- "Mark X": **purely visual** — stored and shown as ✗, but treated exactly like an empty/missed day in all analytics and streaks.

> **File note:** `plan.md` at the repo root is the original project design spec and is
> referenced by code comments (e.g. `types.ts` cites "plan.md §5"). It must NOT be
> overwritten. This plan will be saved to the repo as `FEATURE-PLAN.md` instead.

> **AGENTS.md constraint:** this is a modified Next.js 16 — read the relevant guide in
> `node_modules/next/dist/docs/` before writing any Next-specific code.

---

## Feature 1 — Rate limits & daily limits (AI + all APIs)

**Current state:** the only limit is a per-user daily AI cap (`AI_DAILY_CAP`, default 30)
in `src/lib/ai/usage.ts` via `reserveCall()`. It is **read-then-write, not atomic**
(concurrent calls can both pass the check), there is **no per-minute throttle**, and
**no limiting on non-AI routes** at all.

**Changes:**
- **New shared limiter** `src/lib/rate-limit.ts` — an in-memory sliding-window limiter
  keyed by `userId` (+ route bucket). Simple `Map<key, timestamps[]>` with a windowed
  count; export a `checkRate(key, limit, windowMs)` helper that throws a typed
  `RateLimitError` (status 429, with `retryAfter`). In-memory is acceptable for a
  single-instance deploy; note in a comment that a multi-instance deploy would need a
  shared store (Redis/Mongo TTL) — out of scope now.
- **Wire into `handler()`** in `src/lib/api.ts` (the single wrapper every route uses):
  after auth resolves `userId`, call `checkRate(\`api:${userId}\`, N, 10_000)` for a
  general per-user burst cap (e.g. 60 req / 10s). Return the existing `fail()` envelope
  with 429 + `Retry-After` header on breach. This covers task-logs, mood, notes,
  extras, prefs, export — everything at once.
- **AI-specific hardening** in `src/lib/ai/usage.ts`:
  - Add a **per-minute throttle** (e.g. 5 AI calls/min/user) via the same limiter,
    checked inside `reserveCall()` before the daily cap.
  - **Close the daily-cap race**: use the store's `update`/`upsert` with an atomic
    `$inc` where the Mongo backend supports it. Minimal approach — switch the
    increment to a `findOneAndUpdate({ _id, callsMade: { $lt: cap } }, { $inc })`
    style op in `mongo-store.ts` (add a small `increment` capability), and keep the
    read-then-write fallback for the local backend (single-process, no real race).
  - Surface `retryAfter`/remaining in `aiStatus()` so the UI (`ai/status`) can show it.
- **Config:** add `AI_PER_MIN_CAP` and `API_RATE_LIMIT` envs (with sane defaults) next
  to the existing `AI_DAILY_CAP` handling.

**Files:** `src/lib/rate-limit.ts` (new), `src/lib/api.ts`, `src/lib/ai/usage.ts`,
`src/lib/store/mongo-store.ts` (+ `local-store.ts` interface for the atomic increment),
`src/lib/ai/gemini.ts` (reuse `AiError` shape). Client 429 handling in `src/lib/client.ts`.

---

## Feature 2 — "Edit previous day" button (visible until 6 PM)

**Current state:** the active-day system (`src/lib/active-day.ts`) already models a held
day with a 6 PM auto-advance (`AUTO_ADVANCE_HOUR = 18`) and has server actions
`syncActiveDay` / `advanceActiveDay` (`src/app/actions/active-day.ts`). The navbar
(`src/components/navbar.tsx:118`) already renders a "Proceed to next date" control when
`held`. In `task-table.tsx`, only the current day's applicable cell is editable
(line ~624); past days are read-only.

**Changes:**
- Add an **`editPreviousDay` server action** (in `active-day.ts` actions file) that sets
  the `activeDay` cookie to `real - 1` day — the reverse of `advanceActiveDay` — but
  **only permits it before the 6 PM cutoff** (reuse `computeActiveDay`/`nowInZone` so the
  cutoff is evaluated in the user's timezone, consistent with existing logic).
- Add a **"Edit yesterday" button in the navbar**, shown only when
  `!held && hour < AUTO_ADVANCE_HOUR` (i.e. it's today and still before 6 PM). When the
  day is already held on yesterday, the existing "Proceed to next date" button covers the
  return path. After the action, refresh (see Feature 4 — use the optimistic/transition
  approach, not a bare `router.refresh()`).
- The table already makes the *effective* day editable, so once the cookie points at
  yesterday, yesterday's cells become editable automatically — no table change needed
  beyond confirming the "editable = effective day" gate.

**Files:** `src/app/actions/active-day.ts`, `src/components/navbar.tsx`,
verify gate in `src/components/task-table.tsx`.

---

## Feature 3 — Notes (attachable to tasks + standalone), lightweight editor

**Current state:** no notes entity, no editor library (confirmed none in `package.json`).
Journal uses a plain `<textarea>` (`journal-box.tsx`) — good autosave-on-blur template.
New collections register lazily by name; `extraActivities` is the closest CRUD analog to
mirror end-to-end.

**Data model (mirror `ExtraActivity` pattern):**
- **Type** `Note` in `src/lib/types.ts`: `_id`, `userId`, `taskId?` (null/absent =
  standalone), `title?`, `body` (markdown string), `createdAt`, `updatedAt`.
  Storing markdown text keeps it dependency-free and lets bullets/checklists/bold live in
  one string (`- [ ] item`, `- bullet`, `**bold**`).
- **Register** `notes: collection<Note>("notes")` in `src/lib/store/db.ts`
  (auto-indexed on `{userId, date}` — keep a `userId` field; add a secondary lookup by
  `taskId`).
- **Schema** `noteInputSchema` in `src/lib/schemas.ts` (`title?`, `body`, `taskId?`).
- **Service** `src/lib/services/notes.ts` mirroring `daily.ts` extras helpers:
  `listNotes({ taskId? })`, `getNote`, `upsertNote`, `deleteNote` — each defaulting
  `userId` via `resolveUserId()` and passing a Mongo filter (`{ userId }` or
  `{ userId, taskId }`) alongside the JS predicate (per the store-query-perf convention).
- **Routes** `src/app/api/notes/route.ts` (GET list — supports `?taskId=`, POST upsert)
  and `src/app/api/notes/[id]/route.ts` (PATCH, DELETE), all wrapped in `handler()`
  (so they inherit the new rate limiting) + `parseBody`.

**Editor (lightweight, no dependency):**
- New `src/components/notes/note-editor.tsx` (`"use client"`): a `contentEditable` region
  OR a `<textarea>` + live-preview toggle. To keep it robust and simple, use a
  **markdown `<textarea>` with a small formatting toolbar** (Bold, Bullet, Checklist,
  Heading buttons that insert/wrap markdown at the caret) and a **rendered preview** that
  turns `- [ ] / - [x]` into interactive checkboxes (clicking a checkbox rewrites that
  line in the source and autosaves). This delivers bullets + checklists + basic
  formatting with zero deps and full theme control.
  - Reuse: `Button`, `Card`, `Field`, `inputClass` from `src/components/ui.tsx`; `cn()`;
    design tokens; autosave-on-blur pattern from `journal-box.tsx`.
  - A tiny markdown→elements renderer (bold/italic/headings/bullets/checkboxes only) as a
    local helper — no external markdown lib needed for this limited subset.
- New `src/components/notes/notes-list.tsx` — list/create/delete standalone notes.

**Surfaces:**
- **New page** `src/app/notes/page.tsx` (RSC) listing standalone notes; add nav item in
  `src/components/navbar.tsx`. Add per-page metadata with `robots: { index: false }`
  (matches the other private pages).
- **Task attachment:** add a "Notes" affordance in `src/components/task-row-menu.tsx`
  (open a dialog with `NoteEditor` filtered to that `taskId`), and a small note-count
  indicator on the task row.
- **Proxy:** `/notes` is an authed app route — already covered by the matcher; no
  `PUBLIC_PREFIXES` change.

**Files:** `types.ts`, `store/db.ts`, `schemas.ts`, `services/notes.ts` (new),
`api/notes/route.ts` + `api/notes/[id]/route.ts` (new), `components/notes/*` (new),
`app/notes/page.tsx` (new), `navbar.tsx`, `task-row-menu.tsx`.

---

## Feature 4 — Slow UI updates

**Root cause (measured in exploration):** two mutation patterns exist. Task/mood/extras
toggles are already optimistic (instant). The slow ones are **Pattern B** — client
`fetch` then a bare `router.refresh()`, which re-runs the `force-dynamic` dashboard RSC
and re-reads all five month datasets through the store. Call sites:
`new-task-button.tsx:35`, `task-row-menu.tsx` (`onChanged`), `navbar.tsx:118`,
`timezone-sync.tsx:40`, `ai-quick-add.tsx:74,167`, and reorder rollback.

**Changes:**
- Wrap every post-mutation `router.refresh()` in **`startTransition`** so the refresh is
  non-blocking and the UI stays interactive (keeps a pending state instead of freezing).
- For create/edit/delete task, prefer **optimistically updating the client `tasks` state**
  in `task-table.tsx` (it already owns `logs`/`extras`/`mood` optimistic state — extend
  the same approach to task rows) and drop the full refresh where the client already has
  the new data; fall back to a transition-wrapped refresh on error.
- Confirm the store-query perf fix (compound index + filter hints, already applied) covers
  the dashboard reads so any remaining refresh is cheap.
- Optional (note, not required): add `loading.tsx` skeletons for `/`, `/notes`, etc. for
  perceived-instant navigation.

**Files:** `task-table.tsx`, `new-task-button.tsx`, `task-row-menu.tsx`, `navbar.tsx`,
`ai-quick-add.tsx`, `timezone-sync.tsx`.

---

## Feature 5 — Schedule a task for a specific day / any day / date range

**Current state:** the model + engine already support this. `Task.recurrence` includes
`"one-off"`, plus `startDate`/`endDate`, and `taskAppliesOn` (`src/lib/recurrence.ts`)
already enforces: `one-off` → only on `startDate`; every recurrence → clipped to
`startDate..endDate`. **The only gap is the form never collects `startDate`/`endDate`.**

**Changes:**
- In `src/components/task-form.tsx`, when `recurrence === "one-off"`, show a **single date
  picker** → `startDate` (default tomorrow; presets "Tomorrow" / pick a day). Add a
  **"Date range" affordance** (either a new recurrence-scope control or start/end date
  inputs shown for daily/weekdays/custom too) that sets `startDate` + `endDate`.
- Include `startDate`/`endDate` in the submitted `payload` (currently omitted).
- Verify `taskInputSchema` (`src/lib/schemas.ts`) accepts `startDate`/`endDate`
  (YYYY-MM-DD, optional, end ≥ start) and that `createTask`/`updateTask` persist them
  (exploration says they copy through — confirm).
- No change needed to `taskAppliesOn`, the table, or analytics — they already respect the
  dates.

**Files:** `task-form.tsx`, `schemas.ts` (verify/extend), `services/tasks.ts` (verify).

---

## Feature 6 — Mark ✗ on tasks (purely visual)

**Current state:** logging is presence-based — `logValue`/`isEmpty` in
`src/lib/services/logs.ts` **delete** a boolean log when it's `false`, so there's no
stored "failed" state; "missed" is derived at render.

**Changes (visual-only, per decision):**
- Add an optional **`failed?: boolean`** to `TaskLogValue` (`types.ts`, kind `"boolean"`).
- In `logs.ts`: `computeValue` accepts a `failed` input; `isEmpty` must **not** treat a
  `failed` log as empty (so it persists), while a plain unchecked/false stays deletable.
- `taskLogInputSchema` (`schemas.ts`): add optional `failed`.
- **Boolean cell becomes 3-state** in `task-table.tsx` (`TaskCell`): empty → done (✓) →
  failed (✗) → empty. Render ✗ with `text-danger`. Commit `{ failed: true }` /
  `{ boolStatus: true }` / `{ clear: true }` respectively — reuse the existing optimistic
  `commit()` path.
- **No analytics change:** a `failed` log has `boolStatus !== true` and no `percentage`,
  so `contributionOf`, `getTaskSeries`/`pointFromLog`, and the habit-chart streak logic
  already score it as 0 / not-done — identical to an empty day. Add a brief comment at
  each of those sites noting `failed` is intentionally scored like empty.
- For "avoid" tasks the ✗ reads naturally as "slipped" (still no stats change).

**Files:** `types.ts`, `schemas.ts`, `services/logs.ts`, `task-table.tsx`.

---

## Feature 7 — Disable the default browser right-click menu

**Current state:** the only app-wide client wrapper is `ThemeProvider`; layout is an RSC.
Headless client components (`TimezoneSync`, `ServiceWorkerRegister`) are the established
pattern for document-level effects.

**Changes:**
- New headless client component `src/components/no-context-menu.tsx` (`"use client"`):
  a `useEffect` that adds a `document`-level `contextmenu` listener calling
  `e.preventDefault()`, cleaned up on unmount.
- **Exclude editable fields** (`input`, `textarea`, `contentEditable`, and the new note
  editor) so users keep native paste/spellcheck/select there — check `e.target.closest()`
  before preventing. This is important now that Notes adds real text editing.
- Render it once in `src/app/layout.tsx` body (sibling to `TimezoneSync`).

**Files:** `src/components/no-context-menu.tsx` (new), `src/app/layout.tsx`.

---

## Suggested build order

1. **Feature 4** (transition-wrap refreshes) + **Feature 7** (no-context-menu) — small,
   isolated, immediate quality wins.
2. **Feature 6** (mark ✗) — contained data + table change.
3. **Feature 5** (date pickers in task form) — reuses existing engine.
4. **Feature 2** (edit-previous-day) — reuses active-day actions.
5. **Feature 1** (rate limiting) — shared limiter + `handler()` + AI hardening.
6. **Feature 3** (Notes) — largest; new entity, routes, page, editor. Do last so it
   inherits the rate limiter and no-context-menu exclusions.

## Verification

- `npm run build` (regenerates route types, validates all new routes/pages) and
  `npx tsc --noEmit` — must pass clean.
- **Feature 1:** hammer an API route (e.g. rapid task-log POSTs) → expect 429 +
  `Retry-After` after the burst cap; exceed the AI per-min and daily caps → 429 from the
  AI routes; confirm normal usage is unaffected.
- **Feature 2:** before 6 PM (in the user's tz) the "Edit yesterday" button appears, sets
  the day back, yesterday's cells become editable; after 6 PM it's hidden.
- **Feature 3:** create a standalone note on `/notes` with a bullet + checklist + bold;
  toggle a checkbox and confirm it persists (reload); attach a note to a task via the row
  menu and confirm it's scoped to that task; delete works.
- **Feature 4:** create/edit/delete a task and advance the day — UI updates without the
  ~2s freeze; app stays interactive during refresh.
- **Feature 5:** create a one-off task for tomorrow → it appears only on tomorrow's
  column; create a ranged task → appears only within `startDate..endDate`.
- **Feature 6:** cycle a boolean cell empty→✓→✗→empty; confirm ✗ persists on reload and
  that streaks/completion charts treat ✗ the same as an empty day.
- **Feature 7:** right-click on the page is suppressed; right-click inside a note editor /
  input still shows the native menu.
- Manual smoke via the running dev server / `npm start` for a production-representative run.

## Out of scope / notes

- In-memory rate limiting is per-instance; a multi-instance deploy would need a shared
  store — documented in code, not implemented now.
- No new npm dependencies (editor is dependency-free markdown).
- Do not commit or push (standing constraint) — implement and verify only.
