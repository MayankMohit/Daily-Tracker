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
};

export default nextConfig;
