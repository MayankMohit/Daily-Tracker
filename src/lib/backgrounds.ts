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
