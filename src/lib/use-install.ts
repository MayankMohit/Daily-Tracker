"use client";

// PWA install plumbing. Chromium browsers (Android / Windows / ChromeOS, and
// Chrome/Edge on macOS) fire `beforeinstallprompt`, which we stash so a custom
// button can trigger the native install. Apple's Safari (iOS + macOS) has no such
// API — there we detect it and show manual "Add to Home Screen / Dock" steps.

import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot = { canPrompt: false };
const subs = new Set<() => void>();

function setCanPrompt(canPrompt: boolean) {
  if (snapshot.canPrompt !== canPrompt) {
    snapshot = { canPrompt };
    subs.forEach((f) => f());
  }
}

// Attach as early as the module loads — `beforeinstallprompt` fires soon after
// load, so listening at hydration time reliably catches it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    setCanPrompt(true);
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    setCanPrompt(false);
  });
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
function getSnapshot() {
  return snapshot;
}

/** Whether the browser has offered a native install prompt we can trigger. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).canPrompt;
}

/** Trigger the native install prompt. Returns true if the user accepted. */
export async function triggerInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // a prompt can only be used once
  setCanPrompt(false);
  await e.prompt();
  const choice = await e.userChoice;
  return choice.outcome === "accepted";
}

/** Already running as an installed app (standalone) — don't offer to install. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Safari on iOS/macOS — installs only via the Share menu, so we show steps. */
export function isAppleSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isApple =
    /iPhone|iPad|iPod|Macintosh/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg|OPR/.test(ua);
  return isApple && isSafari;
}
