import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler is a build-time transform that noticeably slows dev
  // (re)compilation. Keep it for production builds (where its auto-memoization
  // pays off) but skip it under `next dev` for faster local iteration.
  reactCompiler: process.env.NODE_ENV === "production",
  // Pin the workspace root so Turbopack doesn't get confused by other lockfiles.
  turbopack: {
    root: __dirname,
  },
  images: {
    // Allow the built-in optimizer to serve user background photos stored in
    // Vercel Blob (see lib/services/backgrounds). Public store hostnames look
    // like `<id>.public.blob.vercel-storage.com`.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
    // Next 16 requires an explicit allowlist; matches the quality used by
    // optimizedBgUrl() (kept high so backgrounds aren't visibly compressed).
    qualities: [75, 90],
  },
};

export default nextConfig;
