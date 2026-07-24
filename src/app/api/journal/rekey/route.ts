import { ok, fail, parseBody, handler } from "@/lib/api";
import { journalKeySetupSchema } from "@/lib/schemas";
import { rekeyJournalKey } from "@/lib/services/daily";

// Change passphrase: store the same data key re-wrapped under the new passphrase.
// The old passphrase is proven client-side (by unwrapping the DEK) before this is
// called; the server only swaps the non-secret envelope. Entries are untouched.

export const POST = handler(async (req: Request) => {
  const { data, error } = await parseBody(req, journalKeySetupSchema);
  if (error) return error;
  try {
    const doc = await rekeyJournalKey(data);
    return ok({
      configured: true,
      salt: doc.salt,
      wrappedDek: doc.wrappedDek,
      wrappedDekIv: doc.wrappedDekIv,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not change passphrase", 409);
  }
});
