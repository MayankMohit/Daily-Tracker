"use client";

// UI customization controls (accent · palette · background · density · corners).
// Every control writes through `useAppearance().setAppearance`, which applies the
// change to <html> instantly (live preview) and debounce-saves it to the server —
// so these settings sync across the user's devices. Light/dark stays on the
// separate ThemeToggle; palettes re-tint the neutrals and still honour the mode.

import { useAppearance } from "./theme-provider";
import { cn } from "@/lib/cn";
import {
  PHOTO_BACKGROUNDS,
  PHOTO_PREFIX,
  photoUrl,
} from "@/lib/backgrounds";
import type {
  AccentChoice,
  CornerChoice,
  DensityChoice,
  PaletteChoice,
} from "@/lib/types";

const ACCENTS: { value: AccentChoice; label: string; color: string }[] = [
  { value: "mono", label: "Mono", color: "var(--foreground)" },
  { value: "blue", label: "Blue", color: "#2563eb" },
  { value: "violet", label: "Violet", color: "#7c3aed" },
  { value: "green", label: "Green", color: "#16a34a" },
  { value: "amber", label: "Amber", color: "#f59e0b" },
  { value: "rose", label: "Rose", color: "#e11d48" },
];

const PALETTES: { value: PaletteChoice; label: string; color: string }[] = [
  { value: "default", label: "Default", color: "#71717a" },
  { value: "slate", label: "Slate", color: "#64748b" },
  { value: "warm", label: "Warm", color: "#a8814f" },
  { value: "forest", label: "Forest", color: "#4d7c5a" },
  { value: "rose", label: "Rose", color: "#c15b76" },
];

const BACKGROUNDS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "aurora", label: "Aurora" },
  { value: "dusk", label: "Dusk" },
  { value: "mesh", label: "Mesh" },
  { value: "grid", label: "Grid" },
  { value: "dots", label: "Dots" },
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

export function AppearanceSettings() {
  const { appearance, setAppearance } = useAppearance();
  const bgOn = appearance.background.preset !== "none";
  // Slider shows how *visible* the pattern is; the stored overlay is the inverse
  // (a higher scrim opacity = a fainter, more readable pattern).
  const visibility = Math.round((1 - appearance.background.overlay) * 100);

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

          {PHOTO_BACKGROUNDS.map((p) => {
            const value = PHOTO_PREFIX + p.file;
            return (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setAppearance({
                    background: { ...appearance.background, preset: value },
                  })
                }
                className={cn(
                  "space-y-1 rounded-lg border p-1 text-center transition-colors",
                  appearance.background.preset === value
                    ? "border-foreground"
                    : "border-border hover:border-foreground/40",
                )}
              >
                <span
                  className="block h-10 w-full rounded-md border border-border bg-surface-2 bg-cover bg-center"
                  style={{ backgroundImage: `url("${photoUrl(p.file)}")` }}
                />
                <span className="block text-[11px] text-muted">{p.label}</span>
              </button>
            );
          })}
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
