// Background image presets. A preset stored in prefs is either a CSS-gradient
// keyword ("none", "aurora", …) handled entirely in CSS, or a user-uploaded
// photo — stored as `img:<absolute blob URL>` and rendered as an inline
// `--bg-image`. Uploaded photos live in Vercel Blob (see services/backgrounds).

/** Prefix marking a background preset as a user image (an absolute URL). */
export const IMAGE_PREFIX = "img:";

/** Most photos a single user may keep uploaded at once. */
export const MAX_BACKGROUND_IMAGES = 5;

export function isImagePreset(preset: string): boolean {
  return preset.startsWith(IMAGE_PREFIX);
}

/** The raw stored image URL carried by an image preset. */
export function imageUrlFromPreset(preset: string): string {
  return preset.slice(IMAGE_PREFIX.length);
}

/** The preset value to store in prefs for a given uploaded image URL. */
export function imagePreset(url: string): string {
  return IMAGE_PREFIX + url;
}

/** Route a background image through Next's built-in Image Optimization API so it
 *  is resized to a sane full-viewport width, re-encoded to a modern format
 *  (WebP/AVIF), and CDN-cached — instead of shipping the original bytes. The blob
 *  host is allow-listed via `images.remotePatterns` in next.config. `width` must
 *  be one of `images.deviceSizes`/`imageSizes` and `q` one of `images.qualities`.
 *  Defaults keep the full-screen background crisp (light-touch compression). */
export function optimizedBgUrl(url: string, width = 2048, quality = 90): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}
