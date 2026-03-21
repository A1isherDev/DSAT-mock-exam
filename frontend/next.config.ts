import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for PM2 deployment
  output: "standalone",

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
    formats: ["image/webp", "image/avif"],
  },

  // Compress responses
  compress: true,

  // Power-optimize production builds
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
