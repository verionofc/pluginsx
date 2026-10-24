import type { NextConfig } from "next";

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "")
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  async rewrites() {
    if (!apiUrl) return [];

    return [
      { source: "/auth/:path*", destination: `${apiUrl}/auth/:path*` },
      { source: "/license/:path*", destination: `${apiUrl}/license/:path*` },
      { source: "/billing/:path*", destination: `${apiUrl}/billing/:path*` },
      { source: "/me/:path*", destination: `${apiUrl}/me/:path*` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
