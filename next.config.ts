import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Désactiver ESLint pendant les builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Optionnel : ignorer aussi les erreurs TypeScript pendant les builds
    // ignoreBuildErrors: true,
  },
};

export default nextConfig;
