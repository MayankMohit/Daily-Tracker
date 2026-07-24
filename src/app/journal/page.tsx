import { PageHeader } from "@/components/ui";
import { JournalBox } from "@/components/journal-box";
import { auth } from "@clerk/nextjs/server";
import { getJournal, journalAiDefault } from "@/lib/services/daily";
import { todayKey } from "@/lib/date";

export const metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  await auth.protect();

  const today = todayKey();
  const [journal, aiDefault] = await Promise.all([
    getJournal(today),
    journalAiDefault(),
  ]);

  return (
    <div>
      <PageHeader
        title="Journal"
        description="A private space to write about your day."
      />
      <JournalBox date={today} initial={journal} aiDefault={aiDefault} />
    </div>
  );
}
