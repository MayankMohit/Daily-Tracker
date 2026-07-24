import { JournalBox } from "@/components/journal-box";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth";
import { getJournal, getJournalKey } from "@/lib/services/daily";
import { getEffectiveToday } from "@/lib/active-day";

export const metadata = { title: "Journal" };
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
      <JournalBox
        date={today}
        initial={journal}
        crypto={crypto}
        userKey={userId}
      />
    </div>
  );
}
