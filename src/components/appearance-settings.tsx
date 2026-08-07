"use client";

// UI customization controls (accent · palette · background · density · corners).
// Every control writes through `useAppearance().setAppearance`, which applies the
// change to <html> instantly (live preview) and debounce-saves it to the server —
// so these settings sync across the user's devices. Light/dark stays on the
// separate ThemeToggle; palettes re-tint the neutrals and still honour the mode.
//
// The Background section also lets the user upload their own photos: they're
// compressed in the browser (lib/image-compress), stored in Vercel Blob via
// /api/backgrounds, and served through Next's image optimizer.

import { useEffect, useRef, useState } from "react";
import { useAppearance } from "./theme-provider";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client";
import { compressImage } from "@/lib/image-compress";
import {
  imagePreset,
  optimizedBgUrl,
  MAX_BACKGROUND_IMAGES,
  isPatternPreset,
  MIN_PATTERN_SCALE,
  MAX_PATTERN_SCALE,
} from "@/lib/backgrounds";
import { Skeleton } from "./ui";
import type {
  AccentChoice,
  BackgroundImage,
  CornerChoice,
  DensityChoice,
  FontChoice,
  FontSizeChoice,
  PaletteChoice,
} from "@/lib/types";

const ACCENTS: { value: AccentChoice; label: string; color: string }[] = [
  { value: "mono", label: "Mono", color: "var(--foreground)" },
  { value: "blue", label: "Blue", color: "#2563eb" },
  { value: "violet", label: "Violet", color: "#7c3aed" },
  { value: "green", label: "Green", color: "#16a34a" },
  { value: "amber", label: "Amber", color: "#f59e0b" },
  { value: "rose", label: "Rose", color: "#e11d48" },
  { value: "cyan", label: "Cyan", color: "#0891b2" },
  { value: "teal", label: "Teal", color: "#0d9488" },
  { value: "indigo", label: "Indigo", color: "#4f46e5" },
  { value: "orange", label: "Orange", color: "#ea580c" },
  { value: "pink", label: "Pink", color: "#db2777" },
  { value: "lime", label: "Lime", color: "#65a30d" },
  { value: "red", label: "Red", color: "#dc2626" },
  { value: "fuchsia", label: "Fuchsia", color: "#c026d3" },
  { value: "yellow", label: "Yellow", color: "#eab308" },
];

const PALETTES: { value: PaletteChoice; label: string; color: string }[] = [
  { value: "default", label: "Default", color: "#71717a" },
  { value: "slate", label: "Slate", color: "#64748b" },
  { value: "warm", label: "Warm", color: "#a8814f" },
  { value: "forest", label: "Forest", color: "#4d7c5a" },
  { value: "rose", label: "Rose", color: "#c15b76" },
  { value: "plum", label: "Plum", color: "#8b5cf6" },
  { value: "sky", label: "Sky", color: "#0ea5e9" },
];

const BACKGROUNDS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "aurora", label: "Aurora" },
  { value: "ocean", label: "Ocean" },
  { value: "sunset", label: "Sunset" },
  { value: "ember", label: "Ember" },
  { value: "mint", label: "Mint" },
  { value: "twilight", label: "Twilight" },
  { value: "bloom", label: "Bloom" },
  { value: "grid", label: "Grid" },
  { value: "dots", label: "Dots" },
  { value: "crosshatch", label: "Hatch" },
  { value: "rings", label: "Rings" },
];

const DENSITIES: { value: DensityChoice; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "cozy", label: "Cozy" },
];

const CORNERS: { value: CornerChoice; label: string }[] = [
  { value: "sharp", label: "Sharp" },
  { value: "rounded", label: "Rounded" },
  { value: "round", label: "Round" },
];

// Each label previews its own typeface so the choice is obvious at a glance.
const FONTS: { value: FontChoice; label: string; className: string }[] = [
  { value: "sans", label: "Sans", className: "font-sans" },
  { value: "serif", label: "Serif", className: "[font-family:var(--font-lora),Georgia,serif]" },
  { value: "mono", label: "Mono", className: "[font-family:var(--font-geist-mono),monospace]" },
  { value: "rounded", label: "Rounded", className: "[font-family:var(--font-nunito),system-ui]" },
];

const FONT_SIZES: { value: FontSizeChoice; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "base", label: "Medium" },
  { value: "lg", label: "Large" },
];

export function AppearanceSettings() {
  const { appearance, setAppearance } = useAppearance();
  const bgOn = appearance.background.preset !== "none";
  // Slider shows how *visible* the pattern is; the stored overlay is the inverse
  // (a higher scrim opacity = a fainter, more readable pattern).
  const visibility = Math.round((1 - appearance.background.overlay) * 100);

  // Section opacity (85–100%): lower reveals more of the background scenery through
  // cards/panels. `--surface-alpha` feeds a `color-mix` that resolves on *every*
  // surface in the document, so a full-page style recalc runs on each change —
  // pushing that on every raw input event stuttered the drag (100ms+ recalcs). So
  // we drive the thumb from fast local state, write the var straight to <html> at
  // most once per animation frame (no React re-render during the drag), and only
  // commit to appearance state (which persists + saves) on release.
  const [dragAlpha, setDragAlpha] = useState<number | null>(null);
  const alphaRaf = useRef<number | null>(null);
  const liveAlpha = dragAlpha ?? appearance.background.surfaceAlpha;
  const sectionOpacity = Math.round(liveAlpha * 100);

  function onOpacityDrag(pct: number) {
    const alpha = pct / 100;
    setDragAlpha(alpha); // thumb follows immediately
    if (alphaRaf.current !== null) cancelAnimationFrame(alphaRaf.current);
    alphaRaf.current = requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--surface-alpha", String(alpha));
    });
  }
  function onOpacityCommit() {
    if (alphaRaf.current !== null) cancelAnimationFrame(alphaRaf.current);
    if (dragAlpha !== null) {
      setAppearance({
        background: { ...appearance.background, surfaceAlpha: dragAlpha },
      });
      setDragAlpha(null);
    }
  }

  // Pattern-density control (only for the repeating-tile presets). Stored value is
  // the tile size in px; the slider reads as "density" (higher = denser = smaller
  // px). While dragging we drive the input from a fast local px value (`dragScale`)
  // so the thumb tracks the cursor exactly, and push the change to the live
  // background only once per animation frame — repainting a full-viewport tiled
  // pattern on every input event stuttered and made the (controlled) thumb snap
  // back. Releasing commits the final value and drops the local override.
  const isPattern = isPatternPreset(appearance.background.preset);
  const scaleSpan = MAX_PATTERN_SCALE - MIN_PATTERN_SCALE;
  const [dragScale, setDragScale] = useState<number | null>(null);
  const scaleRaf = useRef<number | null>(null);
  const liveScale = dragScale ?? appearance.background.patternScale;
  const density = Math.round(((MAX_PATTERN_SCALE - liveScale) / scaleSpan) * 100);

  function applyPatternScale(scale: number) {
    setAppearance({
      background: { ...appearance.background, patternScale: scale },
    });
  }
  function onDensityDrag(pct: number) {
    const scale = MAX_PATTERN_SCALE - (pct / 100) * scaleSpan;
    setDragScale(scale); // thumb follows immediately
    if (scaleRaf.current !== null) cancelAnimationFrame(scaleRaf.current);
    scaleRaf.current = requestAnimationFrame(() => applyPatternScale(scale));
  }
  function onDensityCommit() {
    if (scaleRaf.current !== null) cancelAnimationFrame(scaleRaf.current);
    if (dragScale !== null) {
      applyPatternScale(dragScale);
      setDragScale(null);
    }
  }

  // User-uploaded photos. `null` = still loading the list.
  const [images, setImages] = useState<BackgroundImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    api
      .get<BackgroundImage[]>("/api/backgrounds")
      .then((rows) => live && setImages(rows))
      .catch(() => live && setImages([]));
    return () => {
      live = false;
    };
  }, []);

  const atLimit = (images?.length ?? 0) >= MAX_BACKGROUND_IMAGES;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { file: compressed } = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed);
      const res = await fetch("/api/backgrounds", { method: "POST", body: form });
      const json = (await res.json()) as
        | { ok: true; data: BackgroundImage }
        | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error || "Upload failed");
      const img = json.data;
      setImages((prev) => [img, ...(prev ?? [])]);
      // Select the new photo straight away so the change is visible.
      setAppearance({ background: { ...appearance.background, preset: imagePreset(img.url) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(img: BackgroundImage) {
    setError(null);
    setImages((prev) => (prev ?? []).filter((i) => i._id !== img._id));
    // If the deleted photo was the active background, fall back to a plain one.
    if (appearance.background.preset === imagePreset(img.url)) {
      setAppearance({ background: { ...appearance.background, preset: "none" } });
    }
    try {
      await api.del(`/api/backgrounds/${img._id}`);
    } catch {
      setImages((prev) => [img, ...(prev ?? [])]);
      setError("Couldn't delete that image. Try again.");
    }
  }

  return (
    <div className="space-y-5">
      <Section label="Accent">
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-label={`${a.label} accent`}
              title={a.label}
              onClick={() => setAppearance({ accent: a.value })}
              className={cn(
                "h-8 w-8 rounded-full border transition-transform hover:scale-105",
                appearance.accent === a.value
                  ? "border-foreground ring-2 ring-foreground/30"
                  : "border-border",
              )}
              style={{ backgroundColor: a.color }}
            />
          ))}
        </div>
      </Section>

      <Section label="Palette">
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setAppearance({ palette: p.value })}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                appearance.palette === p.value
                  ? "border-foreground bg-surface-2 text-foreground"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Background">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() =>
                setAppearance({
                  background: { ...appearance.background, preset: b.value },
                })
              }
              className={cn(
                "space-y-1 rounded-lg border p-1 text-center transition-colors",
                appearance.background.preset === b.value
                  ? "border-foreground"
                  : "border-border hover:border-foreground/40",
              )}
            >
              {/* `data-bg` on the tile itself sets the same vars the real
                  background uses, so each preview is fixed to its own preset. */}
              <span
                data-bg={b.value}
                className="bg-swatch block h-10 w-full rounded-md border border-border bg-surface-2"
              />
              <span className="block text-[11px] text-muted">{b.label}</span>
            </button>
          ))}
        </div>

        {/* Uploaded photos */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Your photos</span>
            <span className="text-[11px] text-muted">
              {(images?.length ?? 0)}/{MAX_BACKGROUND_IMAGES}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {images === null ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              images.map((img) => {
                const selected =
                  appearance.background.preset === imagePreset(img.url);
                return (
                  <div key={img._id} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setAppearance({
                          background: {
                            ...appearance.background,
                            preset: imagePreset(img.url),
                          },
                        })
                      }
                      className={cn(
                        "block w-full rounded-lg border p-1 transition-colors",
                        selected
                          ? "border-foreground"
                          : "border-border hover:border-foreground/40",
                      )}
                    >
                      <span
                        className="block h-14 w-full rounded-md border border-border bg-surface-2 bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${optimizedBgUrl(img.url, 640)}")`,
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(img)}
                      aria-label="Delete background photo"
                      title="Delete"
                      className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs leading-none text-white transition-colors hover:bg-black/80"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}

            {images !== null && !atLimit && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-1 text-muted transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-lg leading-none">{busy ? "…" : "+"}</span>
                <span className="text-[11px]">
                  {busy ? "Uploading" : "Upload"}
                </span>
              </button>
            )}
          </div>

          {atLimit && (
            <p className="text-[11px] text-muted">
              You&rsquo;ve reached the {MAX_BACKGROUND_IMAGES}-photo limit. Delete
              one to add another.
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPick}
          />
        </div>

        {bgOn && (
          <label className="mt-3 block space-y-1">
            <span className="flex items-center justify-between text-xs text-muted">
              <span>Background visibility</span>
              <span>{visibility}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={visibility}
              onChange={(e) =>
                setAppearance({
                  background: {
                    ...appearance.background,
                    overlay: 1 - Number(e.target.value) / 100,
                  },
                })
              }
              className="w-full accent-accent"
            />
          </label>
        )}

        {bgOn && (
          <label className="mt-3 block space-y-1">
            <span className="flex items-center justify-between text-xs text-muted">
              <span>Section opacity</span>
              <span>{sectionOpacity}%</span>
            </span>
            <input
              type="range"
              min={85}
              max={100}
              value={sectionOpacity}
              onChange={(e) => onOpacityDrag(Number(e.target.value))}
              onPointerUp={onOpacityCommit}
              onBlur={onOpacityCommit}
              className="w-full accent-accent"
            />
          </label>
        )}

        {isPattern && (
          <label className="mt-3 block space-y-1">
            <span className="flex items-center justify-between text-xs text-muted">
              <span>Pattern density</span>
              <span>{density}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={density}
              onChange={(e) => onDensityDrag(Number(e.target.value))}
              onPointerUp={onDensityCommit}
              onBlur={onDensityCommit}
              className="w-full accent-accent"
            />
          </label>
        )}
      </Section>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <Section label="Density">
          <Segmented
            value={appearance.density}
            options={DENSITIES}
            onChange={(v) => setAppearance({ density: v })}
          />
        </Section>
        <Section label="Corners">
          <Segmented
            value={appearance.corners}
            options={CORNERS}
            onChange={(v) => setAppearance({ corners: v })}
          />
        </Section>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <Section label="Font">
          <div className="inline-flex flex-wrap gap-1.5">
            {FONTS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setAppearance({ font: f.value })}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  f.className,
                  (appearance.font ?? "sans") === f.value
                    ? "border-foreground bg-surface-2 text-foreground"
                    : "border-border text-muted hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Section>
        <Section label="Text size">
          <Segmented
            value={appearance.fontSize ?? "base"}
            options={FONT_SIZES}
            onChange={(v) => setAppearance({ fontSize: v })}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            value === o.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
