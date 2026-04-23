# VibeSync

A shared live experience — one room, one frequency.

Host a listening room, share the code, guests hop in from their phones, and
everyone hears the same track on the same bar. Cross-provider: if the host is
on Spotify and a guest is on Apple Music, the track bridges by title + artist.

## Stack

- Next.js 16 on a custom `tsx` server so socket.io can share the HTTP listener
- React 19, Tailwind v4, framer-motion
- Spotify Web Playback SDK + Apple MusicKit on the client
- three.js / react-three-fiber for the shader backdrop

## Running

```bash
npm install
npm run dev
```

Then open **http://127.0.0.1:3000**. Use the loopback IP, not `localhost` —
the custom server wires HMR upgrades against the same origin you're using,
and Apple MusicKit's CORS checks are fussier about hostnames.

### Apple Music from a phone

MusicKit refuses to initialize over plain HTTP outside `localhost`. To test
from a real device, run:

```bash
npm run dev:tunnel
```

That uses a reserved ngrok subdomain — swap the URL in `package.json` for
your own before running.

## Environment

Create `.env.local` with:

```
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=
NEXT_PUBLIC_APPLE_DEVELOPER_TOKEN=
```

The Apple developer token is a short-lived JWT. Mint one with:

```bash
APPLE_TEAM_ID=XXXX \
APPLE_KEY_ID=XXXX \
APPLE_P8_PATH=./AuthKey.p8 \
  tsx scripts/mint-apple-token.ts
```

Paste the output into `NEXT_PUBLIC_APPLE_DEVELOPER_TOKEN`. Tokens expire in
about six months; re-mint then.

The Spotify redirect URI defaults to
`http://127.0.0.1:3000/auth/spotify/callback` — register that in your Spotify
app, or override with `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI`.

## Layout

```
src/
  app/
    sync/             host sign-in + provider picker
    s/[code]/         joined room (SessionClient)
  components/
    live/             session UI (Centerpiece, TopBar, dock, controls)
    shader/           reveal + backdrop effects
  music/
    adapters/         spotify.ts, apple.ts, matching.ts
    useMusicSession   room sync clock + drift correction
  server/
    sessions.ts       in-memory room registry
server.ts             custom server (Next + socket.io)
```

## Known edges

- Sessions live in memory — restart the server and the room is gone.
- Cross-catalog matching is best effort: normalized title + artist after
  stripping `(Remastered)`, `(Live)`, `[Deluxe]` and the like. ISRCs drift
  between releases so they aren't trusted as canonical identity.
- HMR upgrade routing is handled manually in `server.ts`. If HMR stops
  working in dev, check the upgrade handler there first.
