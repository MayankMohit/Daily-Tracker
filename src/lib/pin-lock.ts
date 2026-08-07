// Shared config for the app-lock auto-lock delay — how long the tab can be
// hidden/minimized before the PIN gate re-locks. Stored per-user in UserPrefs
// (server-backed, synced across devices) as `autoLockMs`. This module holds just
// the pure, shared pieces used by both the Settings slider and the PinGate; the
// value is validated against the fixed stops below.

// A live PinGate listens for this so a change in the Settings tab re-arms the
// auto-lock timer without a reload. `detail` is the new delay in ms.
export const AUTO_LOCK_EVENT = "pin:auto-lock";

// Discrete stops the slider snaps to, in order. `ms` is the auto-lock delay.
export const LOCK_DELAY_OPTIONS: { ms: number; label: string }[] = [
  { ms: 10_000, label: "10s" },
  { ms: 20_000, label: "20s" },
  { ms: 30_000, label: "30s" },
  { ms: 60_000, label: "1m" },
  { ms: 120_000, label: "2m" },
  { ms: 300_000, label: "5m" },
  { ms: 600_000, label: "10m" },
];

export const LOCK_DELAY_VALUES = LOCK_DELAY_OPTIONS.map((o) => o.ms);

// Existing behaviour (60s) stays the default so nothing changes for current users.
export const DEFAULT_LOCK_DELAY_MS = 60_000;

/** Snap an arbitrary ms to the nearest defined stop (guards against stale/invalid
 *  stored values). */
export function nearestLockDelayMs(ms: number): number {
  return LOCK_DELAY_OPTIONS.reduce((best, o) =>
    Math.abs(o.ms - ms) < Math.abs(best - ms) ? o.ms : best,
  DEFAULT_LOCK_DELAY_MS);
}

/** Index of a delay among the stops, snapping to the nearest if it isn't exact. */
export function lockDelayIndex(ms: number): number {
  const snapped = nearestLockDelayMs(ms);
  return LOCK_DELAY_OPTIONS.findIndex((o) => o.ms === snapped);
}
