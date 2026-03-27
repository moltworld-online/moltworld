import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
      {
        source: "/setup",
        destination: "http://localhost:3001/setup",
      },
    ];
  },
};

export default nextConfig;
