"use client";

// Theme handling (plan §3.6). Persists to localStorage for instant load and
// mirrors the choice so a future Clerk-backed `users` doc can hold it too.
// The actual first-paint `data-theme` is set by an inline script in the layout
// (see ThemeScript) to avoid a flash of the wrong theme before hydration.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type { Appearance, ThemeChoice } from "@/lib/types";
import { api } from "@/lib/client";
import {
  isImagePreset,
  imageUrlFromPreset,
  optimizedBgUrl,
} from "@/lib/backgrounds";

const STORAGE_KEY = "dt-theme";
// Mirror of the user's appearance, so it survives offline even when the cached
// server HTML is stale (or fell back to a default render). Written on every
// change and read before first paint by themeInitScript.
const APPEARANCE_KEY = "dt-appearance";

interface ThemeContextValue {
  /** The user's selected preference. */
  choice: ThemeChoice;
  /** The theme actually applied right now ("light" | "dark"). */
  resolved: "light" | "dark";
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface AppearanceContextValue {
  appearance: Appearance;
  /** Patch one or more appearance fields; applies live and saves (debounced). */
  setAppearance: (patch: Partial<Appearance>) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** Reflect the appearance onto <html> as the attributes/vars the CSS keys off. */
function applyAppearance(a: Appearance) {
  const el = document.documentElement;
  el.setAttribute("data-palette", a.palette);
  el.setAttribute("data-accent", a.accent);
  el.setAttribute("data-corners", a.corners);
  el.setAttribute("data-density", a.density);
  el.setAttribute("data-font", a.font ?? "sans");
  el.setAttribute("data-font-size", a.fontSize ?? "base");
  el.style.setProperty("--bg-overlay", String(a.background.overlay));
  el.style.setProperty("--bg-pattern-size", `${a.background.patternScale}px`);
  el.style.setProperty("--surface-alpha", String(a.background.surfaceAlpha));

  // Gradient presets are driven by CSS `[data-bg="…"]`; photos are set inline
  // (the CSS can't know the file names). Clear any inline image when switching
  // back to a gradient/none so the CSS rule wins again.
  const preset = a.background.preset;
  if (isImagePreset(preset)) {
    el.setAttribute("data-bg", "photo");
    el.style.setProperty(
      "--bg-image",
      `url("${optimizedBgUrl(imageUrlFromPreset(preset))}")`,
    );
    el.style.setProperty("--bg-size", "cover");
    el.style.setProperty("--bg-repeat", "no-repeat");
  } else {
    el.setAttribute("data-bg", preset);
    el.style.removeProperty("--bg-image");
    el.style.removeProperty("--bg-size");
    el.style.removeProperty("--bg-repeat");
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** Inline script string that sets data-theme + appearance before first paint.
 *  Reading the appearance mirror here (not just the server-rendered attributes)
 *  means a stale/default cached document still paints the user's real look while
 *  offline; ThemeProvider re-applies the same values after hydration (no flash). */
export const themeInitScript = `
(function () {
  try {
    var c = localStorage.getItem("${STORAGE_KEY}") || "system";
    var dark = c === "dark" || (c === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {}
  try {
    var a = JSON.parse(localStorage.getItem("${APPEARANCE_KEY}") || "null");
    if (a && a.palette) {
      var el = document.documentElement;
      el.setAttribute("data-palette", a.palette);
      el.setAttribute("data-accent", a.accent);
      el.setAttribute("data-corners", a.corners);
      el.setAttribute("data-density", a.density);
      el.setAttribute("data-font", a.font || "sans");
      el.setAttribute("data-font-size", a.fontSize || "base");
      if (a.background) {
        el.style.setProperty("--bg-overlay", String(a.background.overlay));
        el.style.setProperty("--bg-pattern-size", a.background.patternScale + "px");
        el.style.setProperty("--surface-alpha", String(a.background.surfaceAlpha));
      }
    }
  } catch (e) {}
})();
`;

export function ThemeProvider({
  children,
  initialAppearance,
}: {
  children: React.ReactNode;
  /** Server-resolved appearance (already rendered onto <html>) — avoids a flash. */
  initialAppearance: Appearance;
}) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  // Seed from the localStorage mirror when present so the applied look is the
  // user's own even if the server HTML was stale/default (offline). SSR falls
  // back to the server value. Only the settings page consumes this via context,
  // and it's client-navigated — so there's no initial-render hydration mismatch.
  const [appearance, setAppearanceState] = useState<Appearance>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(APPEARANCE_KEY);
        if (saved) return JSON.parse(saved) as Appearance;
      } catch {
        /* corrupt/unavailable — fall back to the server value */
      }
    }
    return initialAppearance;
  });

  // When online, the server-rendered appearance is authoritative (it reflects a
  // change made on another device). Adopt it and refresh the mirror — but only if
  // it actually differs, so we don't fire a redundant save on every load.
  const reconciled = useRef(false);
  useEffect(() => {
    if (reconciled.current || !navigator.onLine) return;
    reconciled.current = true;
    const fresh = JSON.stringify(initialAppearance);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(APPEARANCE_KEY);
    } catch {
      /* ignore */
    }
    if (saved !== fresh) {
      setAppearanceState(initialAppearance);
      try {
        localStorage.setItem(APPEARANCE_KEY, fresh);
      } catch {
        /* ignore */
      }
    }
  }, [initialAppearance]);

  // Read persisted choice on mount.
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeChoice) || "system";
    setChoiceState(stored);
    setResolved(resolve(stored));
  }, []);

  // Apply to <html> and react to system changes when in "system" mode.
  useEffect(() => {
    const apply = () => {
      const r = resolve(choice);
      setResolved(r);
      document.documentElement.setAttribute("data-theme", r);
    };
    apply();
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, c);
    setChoiceState(c);
  }, []);

  // Apply appearance to <html> and persist changes (debounced). The initial run
  // just re-sets the attributes the server already rendered (no-op) and skips the
  // save — we only PATCH on an actual user change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  useEffect(() => {
    applyAppearance(appearance);
    // Keep the offline mirror current with every change (and the initial value).
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      /* storage unavailable — non-fatal */
    }
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.patch("/api/prefs", { appearance }).catch(() => {
        /* transient — the next change re-saves; UI already reflects the choice */
      });
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [appearance]);

  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    setAppearanceState((prev) => ({
      ...prev,
      ...patch,
      background: { ...prev.background, ...patch.background },
    }));
  }, []);

  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice }}>
      <AppearanceContext.Provider value={{ appearance, setAppearance }}>
        {children}
      </AppearanceContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx)
    throw new Error("useAppearance must be used within <ThemeProvider>");
  return ctx;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
