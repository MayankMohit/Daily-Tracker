"use client";

import { useTheme } from "./theme-provider";
import { cn } from "@/lib/cn";
import type { ThemeChoice } from "@/lib/types";

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "system", label: "System", icon: "◐" },
  { value: "dark", label: "Dark", icon: "☾" },
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-label={`${o.label} theme`}
          title={`${o.label} theme`}
          onClick={() => setChoice(o.value)}
          className={cn(
            "h-7 w-7 rounded-md text-sm transition-colors",
            choice === o.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
