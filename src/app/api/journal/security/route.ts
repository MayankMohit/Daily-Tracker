import { ok, fail, parseBody, handler } from "@/lib/api";
import { journalKeySetupSchema } from "@/lib/schemas";
import { getJournalKey, setJournalKey } from "@/lib/services/daily";

// Non-secret journal key envelope. GET reports whether a passphrase is set (and
// returns the salt + wrapped data key needed to unlock in the browser); POST
// performs first-time setup. Plaintext, passphrase, and keys never touch this.

export const GET = handler(async () => {
  const doc = await getJournalKey();
  if (!doc) return ok({ configured: false });
  return ok({
    configured: true,
    salt: doc.salt,
    wrappedDek: doc.wrappedDek,
    wrappedDekIv: doc.wrappedDekIv,
  });
});

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, journalKeySetupSchema);
  if (error) return error;
  try {
    const doc = await setJournalKey(data);
    return ok({
      configured: true,
      salt: doc.salt,
      wrappedDek: doc.wrappedDek,
      wrappedDekIv: doc.wrappedDekIv,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not set passphrase", 409);
  }
});
