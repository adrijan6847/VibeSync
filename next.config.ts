import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Spotify's 2025 redirect URI rules require loopback IPs for local
  // dev (they reject `localhost`). The app is served from
  // http://127.0.0.1:3000 so that OAuth works, but Next 16's dev-origin
  // guard only trusts `localhost` out of the box — without this, the
  // HMR websocket upgrade is blocked with 403.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
