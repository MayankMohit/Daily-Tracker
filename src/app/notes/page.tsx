import { auth } from "@clerk/nextjs/server";
import { NotesList } from "@/components/notes/notes-list";
import { listNotes } from "@/lib/services/notes";

export const metadata = {
  title: "Notes",
  description:
    "Keep free-form notes and checklists — standalone or attached to a task.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function NotesPage() {
  await auth.protect();
  const notes = await listNotes();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <NotesList initial={notes} />
    </div>
  );
}
