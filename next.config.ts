import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Spotify's 2025 redirect URI rules require loopback IPs for local
  // dev (they reject `localhost`). The app is served from
  // http://127.0.0.1:3000 so that OAuth works, but Next 16's dev-origin
  // guard only trusts `localhost` out of the box — without this, the
  // HMR websocket upgrade is blocked with 403.
  //
  // `*.ngrok-free.dev` is there so `npm run dev:tunnel` (ngrok static
  // dev domain on the free tier) can reach the dev server without the
  // origin guard rejecting the forwarded Host header.
  allowedDevOrigins: ['127.0.0.1', '*.ngrok-free.dev'],
};

export default nextConfig;
