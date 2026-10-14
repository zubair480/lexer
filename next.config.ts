import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets `next build` run alongside a live `next dev` without clobbering .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Lint runs separately (`npm run lint`); style rules must not block the demo build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
