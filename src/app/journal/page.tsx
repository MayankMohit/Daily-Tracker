import { JournalBox } from "@/components/journal-box";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth";
import { getJournal, getJournalKey } from "@/lib/services/daily";
import { getEffectiveToday } from "@/lib/active-day";

export const metadata = {
  title: "Journal",
  description:
    "Write private, end-to-end encrypted journal entries for each day.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  await auth.protect();
  const userId = await resolveUserId();

  const today = await getEffectiveToday();
  const [journal, keyDoc] = await Promise.all([
    getJournal(today, userId),
    getJournalKey(userId),
  ]);

  // Only the non-secret key envelope reaches the client; deriving the key,
  // unwrapping, and decrypting all happen in the browser with the passphrase.
  // A doc missing `wrappedDek` is treated as "not set up" (rather than trapping
  // the user on an un-unlockable screen) so setup can replace it.
  const crypto =
    keyDoc && keyDoc.wrappedDek && keyDoc.wrappedDekIv
      ? {
          salt: keyDoc.salt,
          wrappedDek: keyDoc.wrappedDek,
          wrappedDekIv: keyDoc.wrappedDekIv,
        }
      : null;

  return (
    <div>
      {/* Keyed on the effective day so the day-rollover control's refresh
          remounts the editor onto the new day (re-seeding its once-initialised
          title/body/decryption state) instead of leaving yesterday's entry. */}
      <JournalBox
        key={today}
        date={today}
        initial={journal}
        crypto={crypto}
        userKey={userId}
      />
    </div>
  );
}
