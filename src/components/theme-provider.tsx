"use client";

// Theme handling (plan §3.6). Persists to localStorage for instant load and
// mirrors the choice so a future Clerk-backed `users` doc can hold it too.
// The actual first-paint `data-theme` is set by an inline script in the layout
// (see ThemeScript) to avoid a flash of the wrong theme before hydration.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ThemeChoice } from "@/lib/types";

const STORAGE_KEY = "dt-theme";

interface ThemeContextValue {
  /** The user's selected preference. */
  choice: ThemeChoice;
  /** The theme actually applied right now ("light" | "dark"). */
  resolved: "light" | "dark";
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

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

/** Inline script string that sets data-theme before first paint. */
export const themeInitScript = `
(function () {
  try {
    var c = localStorage.getItem("${STORAGE_KEY}") || "system";
    var dark = c === "dark" || (c === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {}
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

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

  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
