import type { NextConfig } from "next";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.48', '192.168.1.48.nip.io', '192.168.1.165'],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
