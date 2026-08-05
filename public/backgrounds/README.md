# Background photos

Drop background images in **this folder** (`public/backgrounds/`). They're served
statically at `/backgrounds/<filename>`.

To make an image selectable in **Settings → Appearance → Background**, add one entry
to `PHOTO_BACKGROUNDS` in [`src/lib/backgrounds.ts`](../../src/lib/backgrounds.ts):

```ts
export const PHOTO_BACKGROUNDS: PhotoBackground[] = [
  { file: "sunrise.jpg", label: "Sunrise" },
  { file: "mountains.jpg", label: "Mountains" },
];
```

That's all — the tile, selection, live preview, and the readability "Background
visibility" slider all work automatically.

Tips:
- Use reasonably compressed JP/WebP (a large hero image, e.g. 1600–2560px wide).
- The image is rendered `cover`/centered and sits behind a theme-coloured scrim
  whose strength you control with the visibility slider (so text stays readable).
- File names can be anything; keep them URL-safe (letters, numbers, `-`, `_`, `.`).
