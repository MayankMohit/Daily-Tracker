// Curated photo backgrounds.
//
// To add one: drop the image file into `public/backgrounds/` and add an entry to
// PHOTO_BACKGROUNDS below — nothing else is needed. It then shows up as a tile in
// Settings → Appearance → Background, and selecting it sets the page background.
//
// Photos are stored in prefs as `photo:<file>` (vs. the CSS-gradient presets like
// "aurora"), and rendered by setting `--bg-image` inline on <html> — so, unlike the
// gradients, they don't need a CSS rule per image.

export interface PhotoBackground {
  /** File name inside `public/backgrounds/` (e.g. "sunrise.jpg"). */
  file: string;
  /** Short label shown under the preview tile. */
  label: string;
}

export const PHOTO_BACKGROUNDS: PhotoBackground[] = [
  { file: "luffy1.jpg", label: "Luffy 1" },
  { file: "luffy2.jpg", label: "Luffy 2" },
];

/** Prefix marking a background preset as a photo rather than a CSS gradient. */
export const PHOTO_PREFIX = "photo:";

export function isPhotoPreset(preset: string): boolean {
  return preset.startsWith(PHOTO_PREFIX);
}

export function photoFile(preset: string): string {
  return preset.slice(PHOTO_PREFIX.length);
}

/** Public URL for a photo file (served statically from `public/backgrounds/`). */
export function photoUrl(file: string): string {
  return `/backgrounds/${encodeURIComponent(file)}`;
}
