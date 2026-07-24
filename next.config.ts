import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin the workspace root so Turbopack doesn't get confused by other lockfiles.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
