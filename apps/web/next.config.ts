import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@wattly/shared'],
  async rewrites() {
    // The browser talks to the API through the web origin, so session cookies stay first-party.
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      // Live updates also go through the web origin, so previews and phones only need one address.
      { source: '/ws', destination: `${API_URL}/ws` },
    ];
  },
  images: { unoptimized: true },
  devIndicators: false,
};

export default nextConfig;
