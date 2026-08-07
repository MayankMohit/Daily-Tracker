"use client";

// Small inline banner shown where a feature needs a connection and isn't usable
// offline (AI, data export, app-lock changes). Keep the copy specific via the
// `feature` prop.

const WifiOffIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M2 2l20 20" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0" />
    <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
    <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
    <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
    <path d="M5 13a10 10 0 0 1 5.24-2.76" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

export function OfflineNotice({ feature }: { feature: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs text-muted">
      <WifiOffIcon className="h-4 w-4 shrink-0" />
      <span>{feature} isn&apos;t available offline — reconnect to use it.</span>
    </div>
  );
}
