// Client-side image compression, run in the browser before upload. Re-encodes a
// picked photo to WebP at a capped resolution so the bytes we send to the server
// (and store in Blob) are a fraction of a phone-camera original — faster uploads,
// cheaper storage. Re-drawing through a canvas also strips EXIF/location metadata.
//
// Browser-only: import from client components. Uses createImageBitmap + canvas.

export interface CompressedImage {
  file: File;
  width: number;
  height: number;
}

export interface CompressOptions {
  /** Longest-edge cap in px; larger images are scaled down proportionally. */
  maxDimension?: number;
  /** WebP quality 0–1 for the first pass. */
  quality?: number;
  /** Give up (throw) if the result still exceeds this many bytes. */
  maxBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 2560,
  quality: 0.95,
  maxBytes: 4 * 1024 * 1024,
};

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Compress `input` to a WebP `File`. Throws if the file isn't an image, can't be
 * decoded, or can't be squeezed under `maxBytes`. The returned file keeps the
 * original name (extension swapped to .webp).
 */
export async function compressImage(
  input: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const { maxDimension, quality, maxBytes } = { ...DEFAULTS, ...options };

  if (!input.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That image couldn't be read. Try a different file.");
  }

  try {
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process the image on this device.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Re-encode, stepping quality down only if the first pass is still too heavy.
    // The floor stays high so photos keep their detail (backgrounds are large).
    let blob: Blob | null = null;
    for (const q of [quality, 0.88, 0.82]) {
      blob = await canvasToBlob(canvas, "image/webp", q);
      if (blob && blob.size <= maxBytes) break;
    }
    if (!blob) throw new Error("Couldn't compress that image.");
    if (blob.size > maxBytes) {
      throw new Error("That image is too large even after compression.");
    }

    const name = input.name.replace(/\.[^.]+$/, "") || "background";
    const file = new File([blob], `${name}.webp`, { type: "image/webp" });
    return { file, width, height };
  } finally {
    bitmap.close();
  }
}
