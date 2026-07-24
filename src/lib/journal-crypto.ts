// End-to-end journal encryption (runs in the browser only).
//
// Envelope scheme:
//   • A random Data Encryption Key (DEK) encrypts every journal entry (AES-GCM).
//   • The DEK itself is wrapped (encrypted) by a Key Encryption Key (KEK) that is
//     derived from the user's passphrase via PBKDF2. Only the wrapped DEK, the
//     salt, and ciphertext are stored server-side.
//
// The server never sees the passphrase, the KEK, the raw DEK, or any plaintext.
// Because entries are keyed by the DEK (not the passphrase), changing the
// passphrase only re-wraps the DEK — entries are never re-encrypted, so a
// passphrase change is fast and can't half-corrupt the journal. Successfully
// unwrapping the DEK (AES-GCM auth) is also what proves a passphrase is correct.

const PBKDF2_ITERATIONS = 210_000;
const IV_BYTES = 12;
const SALT_BYTES = 16;

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function randomSaltB64(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)).buffer);
}

/** Derive the passphrase's Key Encryption Key (wraps/unwraps the DEK). */
async function deriveKek(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64ToBytes(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrapDek(
  kek: CryptoKey,
  dek: CryptoKey,
): Promise<{ wrappedDek: string; wrappedDekIv: string }> {
  const raw = await crypto.subtle.exportKey("raw", dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
  return { wrappedDek: bufToB64(ct), wrappedDekIv: bufToB64(iv.buffer) };
}

async function unwrapDek(
  kek: CryptoKey,
  wrappedDekB64: string,
  wrappedDekIvB64: string,
): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(wrappedDekIvB64) },
    kek,
    b64ToBytes(wrappedDekB64),
  );
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export interface KeyEnvelope {
  salt: string;
  wrappedDek: string;
  wrappedDekIv: string;
}

/** First-time setup: mint a DEK, wrap it under a fresh passphrase-derived KEK. */
export async function createEnvelope(
  passphrase: string,
): Promise<{ envelope: KeyEnvelope; dek: CryptoKey }> {
  const salt = randomSaltB64();
  const kek = await deriveKek(passphrase, salt);
  const dek = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const wrapped = await wrapDek(kek, dek);
  return { envelope: { salt, ...wrapped }, dek };
}

/** Unlock: derive the KEK and unwrap the DEK. Returns null if the passphrase is
 *  wrong (the AES-GCM auth tag fails to verify). */
export async function openEnvelope(
  passphrase: string,
  env: KeyEnvelope,
): Promise<CryptoKey | null> {
  try {
    const kek = await deriveKek(passphrase, env.salt);
    return await unwrapDek(kek, env.wrappedDek, env.wrappedDekIv);
  } catch {
    return null;
  }
}

/** Change passphrase: re-wrap the SAME DEK under a new passphrase. Entries are
 *  untouched. Pass the current DEK (obtained via openEnvelope). */
export async function rewrapEnvelope(
  dek: CryptoKey,
  newPassphrase: string,
): Promise<KeyEnvelope> {
  const salt = randomSaltB64();
  const kek = await deriveKek(newPassphrase, salt);
  const wrapped = await wrapDek(kek, dek);
  return { salt, ...wrapped };
}

export interface Ciphertext {
  cipher: string;
  iv: string;
}

export async function encryptText(
  dek: CryptoKey,
  plaintext: string,
): Promise<Ciphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    dek,
    new TextEncoder().encode(plaintext),
  );
  return { cipher: bufToB64(ct), iv: bufToB64(iv.buffer) };
}

export async function decryptText(
  dek: CryptoKey,
  cipherB64: string,
  ivB64: string,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(ivB64) },
    dek,
    b64ToBytes(cipherB64),
  );
  return new TextDecoder().decode(pt);
}

// ---- Per-tab DEK cache (sessionStorage) so navigating pages doesn't re-prompt.
// Holds the raw DEK for the tab session only; cleared on tab close or Lock.

function cacheKey(userKey: string): string {
  return `lockedin.journalDek.${userKey}`;
}

export async function cacheDek(userKey: string, dek: CryptoKey): Promise<void> {
  try {
    const raw = await crypto.subtle.exportKey("raw", dek);
    sessionStorage.setItem(cacheKey(userKey), bufToB64(raw));
  } catch {
    /* sessionStorage unavailable — in-memory only for this view */
  }
}

export async function readCachedDek(userKey: string): Promise<CryptoKey | null> {
  try {
    const b64 = sessionStorage.getItem(cacheKey(userKey));
    if (!b64) return null;
    return crypto.subtle.importKey(
      "raw",
      b64ToBytes(b64),
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

export function clearCachedDek(userKey: string): void {
  try {
    sessionStorage.removeItem(cacheKey(userKey));
  } catch {
    /* ignore */
  }
}
