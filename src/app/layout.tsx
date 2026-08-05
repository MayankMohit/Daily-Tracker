import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { TimezoneSync } from "@/components/timezone-sync";
import { NoContextMenu } from "@/components/no-context-menu";
import { PinGate } from "@/components/pin/pin-gate";
import { isPinEnabled } from "@/lib/services/pin";
import {
  APP_NAME,
  APP_TAGLINE,
  APP_DESCRIPTION,
  APP_KEYWORDS,
  SITE_URL,
} from "@/lib/config";
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
  // Resolves every relative URL below (canonical, OG, sitemap-linked images)
  // against the deployed origin. Set NEXT_PUBLIC_SITE_URL in production.
  metadataBase: new URL(SITE_URL),
  applicationName: APP_NAME,
  // The installed PWA window prepends the manifest name (APP_NAME) to the page
  // title, so keeping the brand here too would show "LockedIn … - LockedIn …".
  // Page <title>s stay brand-free; the manifest carries the name, and social
  // link previews get the full brand via the openGraph/twitter titles below.
  title: {
    default: "Dashboard",
    template: "%s",
  },
  description: APP_DESCRIPTION,
  keywords: APP_KEYWORDS,
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  category: "productivity",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  // Personal-tracker copy shouldn't get auto-linked as phone numbers/addresses.
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  icons: {
    icon: "/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // OG/Twitter images are supplied automatically by the opengraph-image.tsx /
  // twitter-image.tsx file conventions in this folder.
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
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

  // Whether this user has the app-lock PIN on. Resolved server-side so the lock
  // screen is in the initial HTML (no flash of app content before it mounts).
  // `auth()` throws on requests the proxy matcher doesn't cover (static assets,
  // the web manifest, …), which the root layout also renders — so degrade to
  // "off" there rather than crash the whole render (mirrors getActiveTimeZone).
  let pinEnabled = false;
  try {
    const { userId } = await auth();
    pinEnabled = userId ? await isPinEnabled(userId) : false;
  } catch {
    pinEnabled = false;
  }

  // Rich-result structured data: tells search engines this is a free web app in
  // the productivity category. Rendered server-side so crawlers see it in the
  // initial HTML on the public entry pages.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    description: APP_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS, Android",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint to avoid a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
            <Navbar activeDay={activeDay} pinEnabled={pinEnabled} />
            <main className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </ThemeProvider>
          {/* Only renders a screen when the PIN is on; `pinEnabled` is derived
              from the signed-in user, and PinGate also self-hides if signed out. */}
          <PinGate initialEnabled={pinEnabled} />
          <TimezoneSync />
          <ServiceWorkerRegister />
          <NoContextMenu />
        </ClerkProvider>
      </body>
    </html>
  );
}
