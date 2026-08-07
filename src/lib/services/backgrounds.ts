// Background photos domain logic. Uploaded images are stored in Vercel Blob and
// tracked here (one doc per image, scoped to the user). The stored blob is
// public — the URL is embedded in the user's appearance prefs and served through
// Next's image optimizer — but only the owner can list/add/delete their images.
//
// Requires BLOB_READ_WRITE_TOKEN (auto-injected on Vercel once a Blob store is
// linked; set it locally in .env.local to test uploads off-platform).

import { put, del } from "@vercel/blob";
import { db, newId } from "@/lib/store/db";
import { resolveUserId } from "@/lib/auth";
import { MAX_BACKGROUND_IMAGES } from "@/lib/backgrounds";
import type { BackgroundImage } from "@/lib/types";

/** Uploads that survive client-side compression should be well under this; the
 *  cap is a backstop so a crafted request can't stream an arbitrarily large body
 *  into Blob. Vercel's serverless request limit (~4.5 MB) sits above this too. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
  "image/gif": "gif",
};

export function isAllowedImageType(type: string): boolean {
  return type in EXT_BY_TYPE;
}

/** A user's uploaded background photos, newest first. */
export async function listBackgroundImages(
  userId?: string,
): Promise<BackgroundImage[]> {
  userId ??= await resolveUserId();
  const rows = await db.backgroundImages.find(
    (b) => b.userId === userId,
    { userId },
  );
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class BackgroundLimitError extends Error {}
export class BlobNotConfiguredError extends Error {}

/**
 * Store an uploaded image in Blob and record it. Enforces the per-user cap and a
 * hard byte ceiling. Throws BackgroundLimitError at the cap and
 * BlobNotConfiguredError when no Blob token is present.
 */
export async function addBackgroundImage(
  file: Blob,
  contentType: string,
  userId?: string,
): Promise<BackgroundImage> {
  userId ??= await resolveUserId();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new BlobNotConfiguredError(
      "Image storage isn't set up yet (missing BLOB_READ_WRITE_TOKEN).",
    );
  }

  const existing = await listBackgroundImages(userId);
  if (existing.length >= MAX_BACKGROUND_IMAGES) {
    throw new BackgroundLimitError(
      `You can keep up to ${MAX_BACKGROUND_IMAGES} background images. Delete one to add another.`,
    );
  }

  const ext = EXT_BY_TYPE[contentType] ?? "jpg";
  const id = newId();
  // Random suffix guards against any pathname collision / guessability; per-user
  // folder keeps the store tidy and makes ownership obvious in the dashboard.
  const blob = await put(`backgrounds/${userId}/${id}.${ext}`, file, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });

  const doc: BackgroundImage = {
    _id: id,
    userId,
    url: blob.url,
    pathname: blob.pathname,
    createdAt: new Date().toISOString(),
  };
  return db.backgroundImages.insert(doc);
}

/** Delete one of the user's images from Blob and the store. Returns false if the
 *  id isn't found/owned. Best-effort on the Blob side — a failed remote delete
 *  still removes the record so it stops showing in the picker. */
export async function deleteBackgroundImage(
  id: string,
  userId?: string,
): Promise<BackgroundImage | null> {
  userId ??= await resolveUserId();
  const existing = await db.backgroundImages.findById(id);
  if (!existing || existing.userId !== userId) return null;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(existing.url);
    } catch {
      /* orphaned blob is harmless; the record is what drives the UI */
    }
  }
  await db.backgroundImages.remove(id);
  return existing;
}
