import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Playwright suite talks to 127.0.0.1, not localhost. Without this, Next
  // blocks its own HMR socket as a cross-origin request in dev and the webserver
  // log fills with warnings that look like test failures.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
