"use client";

// Today's journal entry — end-to-end encrypted. Text is encrypted in the browser
// with a data key that is itself wrapped by a passphrase only the user knows; the
// server only ever stores ciphertext. The passphrase is never sent anywhere.
// Flow:
//   • first time  → set a passphrase (no recovery — that's the point)
//   • returning   → unlock with the passphrase (cached per browser tab)
//   • unlocked    → the warm, unpressured writing page, with autosave-on-blur
// Users can change their passphrase (re-wraps the data key; entries untouched)
// and, on first unlock, any older plaintext entries are re-encrypted.

import { useState, useRef, useEffect, useCallback } from "react";
import { format } from "date-fns";
import type { JournalEntry } from "@/lib/types";
import { api } from "@/lib/client";
import { dayKeyToDate, type DayKey } from "@/lib/date";
import { Card, inputClass, Button } from "./ui";
import {
  type KeyEnvelope,
  createEnvelope,
  openEnvelope,
  rewrapEnvelope,
  encryptText,
  decryptText,
  cacheDek,
  readCachedDek,
  clearCachedDek,
} from "@/lib/journal-crypto";

const STARTERS = [
  "One good thing that happened today was ",
  "Right now I'm feeling ",
  "Something on my mind is ",
  "A small win today: ",
  "I don't want to forget ",
];

const MIN_PASSPHRASE = 8;

type Phase = "loading" | "setup" | "locked" | "unlocked";

export function JournalBox({
  date,
  initial,
  crypto: initialCrypto,
  userKey,
}: {
  date: DayKey;
  initial: JournalEntry | null;
  crypto: KeyEnvelope | null;
  userKey: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [env, setEnv] = useState<KeyEnvelope | null>(initialCrypto);
  const dekRef = useRef<CryptoKey | null>(null);

  const dateObj = dayKeyToDate(date);
  const weekday = format(dateObj, "EEEE");
  const fullDate = format(dateObj, "MMMM d, yyyy");

  // Editor state.
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const lastSaved = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [migrationNote, setMigrationNote] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [changedNote, setChangedNote] = useState<string | null>(null);

  // Decrypt (or read legacy) today's entry into the editor.
  const loadInitial = useCallback(
    async (dek: CryptoKey) => {
      let value = "";
      if (initial?.cipher && initial?.iv) {
        try {
          value = await decryptText(dek, initial.cipher, initial.iv);
        } catch {
          value = "";
        }
      } else if (initial?.text) {
        value = initial.text; // legacy plaintext, re-encrypted by migration
      }
      setText(value);
      lastSaved.current = value;
    },
    [initial],
  );

  // Re-encrypt any entries still stored as plaintext from before E2E.
  const migrateLegacy = useCallback(async (dek: CryptoKey) => {
    try {
      const legacy = await api.get<{ date: string; text: string }[]>(
        "/api/journal/legacy",
      );
      if (legacy.length === 0) return;
      for (const e of legacy) {
        const { cipher, iv } = await encryptText(dek, e.text);
        await api.post("/api/journal", { date: e.date, cipher, iv });
      }
      setMigrationNote(
        `Encrypted ${legacy.length} earlier ${
          legacy.length === 1 ? "entry" : "entries"
        }.`,
      );
    } catch {
      /* best-effort; a failure just leaves them for the next unlock */
    }
  }, []);

  const enterUnlocked = useCallback(
    async (dek: CryptoKey) => {
      dekRef.current = dek;
      await loadInitial(dek);
      setPhase("unlocked");
      migrateLegacy(dek);
    },
    [loadInitial, migrateLegacy],
  );

  // On mount: decide phase, reusing a cached key if this tab already unlocked.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!initialCrypto) {
        setPhase("setup");
        return;
      }
      const cached = await readCachedDek(userKey);
      if (cached && !cancelled) {
        await enterUnlocked(cached);
      } else if (!cancelled) {
        setPhase("locked");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(nextText: string) {
    const dek = dekRef.current;
    if (!dek) return;
    setStatus("saving");
    try {
      const { cipher, iv } = await encryptText(dek, nextText);
      await api.post("/api/journal", { date, cipher, iv });
      lastSaved.current = nextText;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("idle");
    }
  }

  function applyStarter(starter: string) {
    setText(starter);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function lock() {
    if (text !== lastSaved.current) save(text);
    clearCachedDek(userKey);
    dekRef.current = null;
    setText("");
    lastSaved.current = "";
    setChanging(false);
    setPhase("locked");
  }

  if (phase === "loading") {
    return (
      <Card className="flex h-40 items-center justify-center text-sm text-muted">
        Unlocking your journal…
      </Card>
    );
  }

  if (phase === "setup") {
    return (
      <SetupCard
        userKey={userKey}
        onComplete={async (dek, envelope) => {
          setEnv(envelope);
          await enterUnlocked(dek);
        }}
      />
    );
  }

  if (phase === "locked" && env) {
    return (
      <UnlockCard
        env={env}
        userKey={userKey}
        onComplete={(dek) => enterUnlocked(dek)}
      />
    );
  }

  // Unlocked editor.
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {weekday}&rsquo;s page
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {fullDate} · no rules, no wrong words — just you and the day.
          </p>
        </div>

        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted"
          title="Encrypted on your device. Only your passphrase can read it."
        >
          🔒 End-to-end encrypted
        </span>
      </div>

      {changedNote && (
        <p className="rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
          {changedNote}
        </p>
      )}

      {changing && env ? (
        <ChangePassphraseCard
          env={env}
          onDone={(newEnv) => {
            setChanging(false);
            if (newEnv) {
              setEnv(newEnv);
              setChangedNote("Passphrase changed. Use the new one from now on.");
            }
          }}
        />
      ) : (
        <>
          {migrationNote && (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              {migrationNote}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {text.trim().length === 0 &&
                STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => applyStarter(s)}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    {s.trim().replace(/[:]?$/, "")}…
                  </button>
                ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setChangedNote(null);
                  setChanging((c) => !c);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-border"
              >
                🔑 Change passphrase
              </button>
              <button
                type="button"
                onClick={lock}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-border"
              >
                🔒 Lock
              </button>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            style={{
              height: "80vh",
              fontFamily:
                "var(--font-handwriting), var(--font-geist-sans), ui-sans-serif, system-ui",
              fontSize: "1.7rem",
              lineHeight: 1.7,
            }}
            className="w-full resize-none rounded-xl border border-border bg-surface px-5 py-4 text-foreground placeholder:text-muted/60 focus:outline-none focus-visible:outline-none focus:border-foreground/40 focus-visible:border-foreground/40"
            placeholder="Start anywhere. A single honest sentence is a whole entry — what lifted you, what weighed on you, what you'd tell yourself tomorrow."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (text !== lastSaved.current) save(text);
            }}
          />

          <div className="flex items-center justify-between text-xs text-muted">
            <span>Saves on its own when you step away.</span>
            <span>
              {status === "saving"
                ? "Saving…"
                : status === "saved"
                  ? "Saved ✓"
                  : ""}
            </span>
          </div>

          <PrivacyNote />
        </>
      )}
    </Card>
  );
}

/** Plain-language explainer so users understand — and can trust — the guarantee. */
function PrivacyNote() {
  return (
    <details className="rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs text-muted">
      <summary className="cursor-pointer select-none font-medium text-foreground">
        🔒 How your journal stays private
      </summary>
      <ul className="mt-2 space-y-1.5 leading-relaxed">
        <li>
          Everything you write is <strong>encrypted on your device</strong>{" "}
          before it&rsquo;s ever sent or saved.
        </li>
        <li>
          The key is derived from <strong>your passphrase, which never leaves
          this device</strong> — we don&rsquo;t receive it, store it, or have any
          way to guess it.
        </li>
        <li>
          Our servers and database only ever hold <strong>scrambled
          text</strong>. No one who runs this app can read your entries — not
          even us.
        </li>
        <li>
          Because only your passphrase can unlock it, there is{" "}
          <strong>no reset</strong>. If you forget it, the entries can&rsquo;t be
          recovered by anyone.
        </li>
        <li>AI features never read your journal.</li>
      </ul>
    </details>
  );
}

function SetupCard({
  userKey,
  onComplete,
}: {
  userKey: string;
  onComplete: (dek: CryptoKey, env: KeyEnvelope) => Promise<void>;
}) {
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pass1.length < MIN_PASSPHRASE) {
      setError(`Use at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    if (pass1 !== pass2) {
      setError("The two passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      const { envelope, dek } = await createEnvelope(pass1);
      await api.post("/api/journal/security", envelope);
      await cacheDek(userKey, dek);
      await onComplete(dek, envelope);
    } catch {
      setError("Couldn't set up encryption. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Make your journal private
        </h1>
        <p className="text-sm text-muted">
          Set a passphrase and everything you write is encrypted on your device
          before it&rsquo;s saved. Not even the people who run this app can read
          it.
        </p>
      </div>

      <PrivacyNote />

      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          placeholder="Choose a passphrase"
          value={pass1}
          onChange={(e) => setPass1(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          placeholder="Confirm passphrase"
          value={pass2}
          onChange={(e) => setPass2(e.target.value)}
        />

        <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          There is no way to reset this. If you forget your passphrase, your
          entries can never be recovered — by you or anyone else.
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Setting up…" : "Encrypt my journal"}
        </Button>
      </form>
    </Card>
  );
}

function UnlockCard({
  env,
  userKey,
  onComplete,
}: {
  env: KeyEnvelope;
  userKey: string;
  onComplete: (dek: CryptoKey) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const dek = await openEnvelope(passphrase, env);
      if (!dek) {
        setError("Incorrect passphrase. Try again.");
        setBusy(false);
        return;
      }
      await cacheDek(userKey, dek);
      await onComplete(dek);
    } catch {
      setError("Couldn't unlock. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Unlock your journal
        </h1>
        <p className="text-sm text-muted">
          Enter your passphrase to read and write today&rsquo;s page. It stays on
          this device only.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          className={inputClass}
          placeholder="Your passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>

      <PrivacyNote />
    </Card>
  );
}

function ChangePassphraseCard({
  env,
  onDone,
}: {
  env: KeyEnvelope;
  onDone: (newEnv: KeyEnvelope | null) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next1.length < MIN_PASSPHRASE) {
      setError(`Use at least ${MIN_PASSPHRASE} characters for the new passphrase.`);
      return;
    }
    if (next1 !== next2) {
      setError("The new passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      // Prove the current passphrase by unwrapping the data key with it.
      const dek = await openEnvelope(current, env);
      if (!dek) {
        setError("Current passphrase is incorrect.");
        setBusy(false);
        return;
      }
      const newEnv = await rewrapEnvelope(dek, next1);
      await api.post("/api/journal/rekey", newEnv);
      onDone(newEnv);
    } catch {
      setError("Couldn't change passphrase. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-3 rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          Change passphrase
        </h2>
        <p className="text-xs text-muted">
          Your entries stay exactly as they are — only the passphrase that unlocks
          them changes. You&rsquo;ll need your current one to confirm.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          className={inputClass}
          placeholder="Current passphrase"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          placeholder="New passphrase"
          value={next1}
          onChange={(e) => setNext1(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          placeholder="Confirm new passphrase"
          value={next2}
          onChange={(e) => setNext2(e.target.value)}
        />

        <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          The new passphrase also has no reset. Forgetting it means the entries
          can never be recovered.
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? "Changing…" : "Change passphrase"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onDone(null)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
