import { ok, fail, parseBody, handler } from "@/lib/api";
import { noteInputSchema } from "@/lib/schemas";
import { listNotes, upsertNote } from "@/lib/services/notes";

// GET /api/notes            → standalone notes
// GET /api/notes?taskId=... → notes attached to that task
export const GET = handler(async (req: Request) => {
  const taskId = new URL(req.url).searchParams.get("taskId") ?? undefined;
  const notes = await listNotes({ taskId });
  return ok(notes);
});

// POST /api/notes → create (no id) or update (with id) a note.
export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, noteInputSchema);
  if (error) return error;
  const note = await upsertNote(data);
  if (!note) return fail("Note not found", 404);
  return ok(note, { status: data.id ? 200 : 201 });
});
