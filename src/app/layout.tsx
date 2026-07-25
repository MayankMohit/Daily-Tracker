import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { TimezoneSync } from "@/components/timezone-sync";
import { APP_NAME } from "@/lib/config";
import { getActiveDay } from "@/lib/active-day";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Handwriting face for the journal writing surface — warm and personal, while
// the rest of the app stays on Geist.
const caveat = Caveat({
  variable: "--font-handwriting",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // The installed PWA window prepends the manifest name (APP_NAME) to the page
  // title, so keeping the brand here too would show "LockedIn … - LockedIn …".
  // Page titles stay brand-free; the manifest carries the name.
  title: {
    default: "Dashboard",
    template: "%s",
  },
  description:
    "LockedIn — stay focused with daily task tracking, mood logging, journaling, and AI insights.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  icons: {
    icon: "/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const activeDay = await getActiveDay();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint to avoid a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} min-h-dvh font-sans antialiased`}
      >
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <ThemeProvider>
            <Navbar activeDay={activeDay} />
            <main className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </ThemeProvider>
          <TimezoneSync />
          <ServiceWorkerRegister />
        </ClerkProvider>
      </body>
    </html>
  );
}
