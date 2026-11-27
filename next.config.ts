import type { NextConfig } from "next";

const rustBackend = process.env.RUST_BACKEND_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    if (!rustBackend) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${rustBackend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
