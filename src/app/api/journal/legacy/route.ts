import { ok, handler } from "@/lib/api";
import { getLegacyJournals } from "@/lib/services/daily";

// Returns the signed-in user's still-plaintext journal entries so the client can
// re-encrypt them on unlock. Only the owner (via the handler's auth check) can
// reach this; after migration these entries carry ciphertext and stop appearing.

export const GET = handler(async () => {
  const entries = await getLegacyJournals();
  return ok(entries);
});
