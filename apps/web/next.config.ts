import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@wattly/shared'],
  async rewrites() {
    // The browser talks to the API through the web origin, so session cookies stay first-party.
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  images: { unoptimized: true },
};

export default nextConfig;
