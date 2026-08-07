"use client";

// Install-app entry points: a nav button (desktop) and a fixed bottom bar
// (mobile). Both trigger the native install where available, or open manual
// Add-to-Home-Screen steps on Apple Safari. Nothing renders once installed.

import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { cn } from "@/lib/cn";
import {
  useCanInstall,
  triggerInstall,
  isStandalone,
  isAppleSafari,
} from "@/lib/use-install";

const DISMISS_KEY = "install-bar-dismissed";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

// Shared gate: whether to offer install, and by which path. `standalone`/`manual`
// resolve on mount (they'd differ between SSR and client), so the button only
// appears after hydration — matching the server's "nothing" render.
function useInstallOffer() {
  const canPrompt = useCanInstall();
  const [meta, setMeta] = useState({ ready: false, standalone: false, manual: false });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeta({ ready: true, standalone: isStandalone(), manual: isAppleSafari() });
  }, []);
  return {
    available: meta.ready && !meta.standalone && (canPrompt || meta.manual),
    canPrompt,
  };
}

function InstallHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Install this app">
      <div className="space-y-3 text-sm">
        <p className="text-muted">Add it to your home screen or dock:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Tap the <span className="font-medium text-foreground">Share</span>{" "}
            button in Safari.
          </li>
          <li>
            Choose{" "}
            <span className="font-medium text-foreground">Add to Home Screen</span>{" "}
            (iPhone/iPad) or{" "}
            <span className="font-medium text-foreground">Add to Dock</span> (Mac).
          </li>
          <li>
            Tap <span className="font-medium text-foreground">Add</span>.
          </li>
        </ol>
      </div>
    </Modal>
  );
}

/** Desktop navbar button (after Settings). Hidden on mobile and once installed. */
export function NavInstallButton() {
  const { available, canPrompt } = useInstallOffer();
  const [help, setHelp] = useState(false);
  if (!available) return null;
  const onClick = () => (canPrompt ? void triggerInstall() : setHelp(true));
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title="Install as an app"
        className={cn(
          "hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-opacity md:inline-flex",
          "bg-accent text-accent-foreground shadow-sm hover:opacity-90",
        )}
      >
        <DownloadIcon className="h-4 w-4" />
        Install app
      </button>
      <InstallHelp open={help} onClose={() => setHelp(false)} />
    </>
  );
}

/** Mobile-only fixed bar at the bottom of the screen. Dismissible (remembered). */
export function InstallAppBar() {
  const { available, canPrompt } = useInstallOffer();
  const [help, setHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      saved = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(saved);
  }, []);

  if (!available || dismissed) return null;

  const install = () => (canPrompt ? void triggerInstall() : setHelp(true));
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-border bg-surface/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <DownloadIcon className="h-4 w-4 shrink-0 text-accent" />
        <button
          type="button"
          onClick={install}
          className="flex-1 rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Install app
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <InstallHelp open={help} onClose={() => setHelp(false)} />
    </>
  );
}
