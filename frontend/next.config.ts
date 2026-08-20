import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/dashboard/login',
        destination: '/login',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
