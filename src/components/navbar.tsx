"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/config";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/mood", label: "Mood" },
  { href: "/journal", label: "Journal" },
  { href: "/insights", label: "Insights" },
  { href: "/planner", label: "Day Planner" },
  { href: "/settings", label: "Settings" },
];

export function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  // Hide the nav on the auth pages — they render Clerk's own centered card.
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex h-14 w-full items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-lg">
          <Image src="/icons/logo.png" alt={APP_NAME} width={40} height={40} className="rounded-md" priority unoptimized />
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {isSignedIn ? (
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <SignInButton mode="modal">
                <button className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-md bg-accent px-3 py-1.5 text-accent-foreground hover:opacity-90">
                  Sign up
                </button>
              </SignUpButton>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
