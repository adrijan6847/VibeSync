# Project notes

A couple of things worth knowing before touching code here.

## Next.js 16

This project is on the Next 16 line. Routing, caching, and some APIs have
shifted from 14/15. When a behavior looks off, check
`node_modules/next/dist/docs/` for the version-accurate guide instead of
going by memory — the surface has changed faster than most references
online have caught up to.

## Custom server

`server.ts` is the dev and prod entry (`npm run dev` runs it via `tsx`).
The custom server exists so socket.io can share the HTTP listener with Next.
Two things to remember:

- The dev origin is `127.0.0.1`, not `localhost`. Next's `allowedDevOrigins`
  and MusicKit's CORS both care about the hostname matching exactly.
- HMR websocket upgrades are routed manually. If HMR stops working in dev,
  the upgrade handler in `server.ts` is the first place to look.
