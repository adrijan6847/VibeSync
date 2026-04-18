/**
 * Spotify adapter — first concrete MusicProvider.
 *
 * ALL Spotify-specific code belongs in this file. Other music-layer
 * modules see only CanonicalTrack, SyncClock, PlaybackState.
 *
 * Auth (Phase 2 scope): reads an access token from
 *   window.__VIBESYNC_SPOTIFY_TOKEN__   (dev override)
 *   localStorage.vs.spotify.token
 * Full PKCE OAuth flow lands in Phase 2.5 via a separate module.
 *
 * Requires: Spotify Premium account; token scopes
 *   streaming  user-read-email  user-read-private  user-modify-playback-state
 */

import type {
  CanonicalTrack,
  PlaybackState,
  ProviderTrackHandle,
} from '../types';
import type {
  MusicProvider,
  PlaybackStateListener,
  Unsubscribe,
} from './MusicProvider';
import { registerAdapter } from './index';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
const TOKEN_STORAGE_KEY = 'vs.spotify.token';

// Minimal SDK typings — kept local to this file.
type SpotifySDK = {
  Player: new (opts: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyPlayer;
};

type SpotifyPlayerState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: { uri: string; id: string | null } };
};

type SpotifyImage = { url: string; width: number | null; height: number | null };

type SpotifySearchResponse = {
  tracks?: {
    items: Array<{
      uri: string;
      name: string;
      duration_ms: number;
      external_ids?: { isrc?: string };
      artists: Array<{ name: string }>;
      album?: { name: string; images?: SpotifyImage[] };
    }>;
  };
};

function pickArtwork(images?: SpotifyImage[]): string | undefined {
  if (!images || images.length === 0) return undefined;
  // Prefer ~300px; Spotify returns largest first.
  const mid = images.find((i) => i.width && i.width >= 200 && i.width <= 400);
  return (mid ?? images[images.length - 1]).url;
}

type SpotifyPlayer = {
  addListener(ev: 'ready', cb: (e: { device_id: string }) => void): void;
  addListener(ev: 'not_ready', cb: (e: { device_id: string }) => void): void;
  addListener(
    ev: 'player_state_changed',
    cb: (s: SpotifyPlayerState | null) => void,
  ): void;
  addListener(
    ev:
      | 'initialization_error'
      | 'authentication_error'
      | 'account_error'
      | 'playback_error',
    cb: (e: { message: string }) => void,
  ): void;
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  activateElement(): Promise<void>;
};

declare global {
  interface Window {
    Spotify?: SpotifySDK;
    onSpotifyWebPlaybackSDKReady?: () => void;
    __VIBESYNC_SPOTIFY_TOKEN__?: string;
  }
}

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.__VIBESYNC_SPOTIFY_TOKEN__) return window.__VIBESYNC_SPOTIFY_TOKEN__;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

let sdkPromise: Promise<SpotifySDK> | null = null;
function loadSDK(): Promise<SpotifySDK> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Spotify SDK is browser-only'));
      return;
    }
    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify);
      else reject(new Error('Spotify SDK loaded without global'));
    };
    const el = document.createElement('script');
    el.src = SDK_SRC;
    el.async = true;
    el.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.head.appendChild(el);
  });
  return sdkPromise;
}

class SpotifyAdapter implements MusicProvider {
  readonly id = 'spotify' as const;
  readonly displayName = 'Spotify';

  private token: string | null = null;
  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private listeners = new Set<PlaybackStateListener>();

  // Local mirror of playback state — updated by SDK events and by our own play calls.
  private currentCanonicalId: string | null = null;
  private paused = true;
  private lastPositionMs = 0;
  private lastPositionAt = 0; // performance.now() when lastPositionMs was reported

  async authenticate(): Promise<void> {
    this.token = readToken();
    if (!this.token) {
      throw new Error(
        'Spotify access token missing. Set window.__VIBESYNC_SPOTIFY_TOKEN__ ' +
          'or localStorage.vs.spotify.token. OAuth flow lands in Phase 2.5.',
      );
    }
    const sdk = await loadSDK();
    const player = new sdk.Player({
      name: 'VibeSync',
      getOAuthToken: (cb) => cb(this.token ?? ''),
      volume: 0.8,
    });
    player.addListener('ready', ({ device_id }) => {
      this.deviceId = device_id;
      this.emit();
    });
    player.addListener('not_ready', () => {
      this.deviceId = null;
      this.emit();
    });
    player.addListener('player_state_changed', (state) => {
      if (!state) return;
      this.paused = state.paused;
      this.lastPositionMs = state.position;
      this.lastPositionAt = performance.now();
      this.emit();
    });
    for (const ev of [
      'initialization_error',
      'authentication_error',
      'account_error',
      'playback_error',
    ] as const) {
      player.addListener(ev, ({ message }) => {
        // Harmless transients the SDK surfaces during normal transport:
        //   - "no list was loaded"  → touched transport before first queue
        //   - "operation is not allowed" → overlapping play/seek calls
        // We already guard both in code; silencing the log noise.
        if (
          ev === 'playback_error' &&
          (message?.includes('no list was loaded') ||
            message?.includes('operation is not allowed'))
        ) {
          return;
        }
        console.error(`[spotify:${ev}]`, message);
      });
    }
    const ok = await player.connect();
    if (!ok) throw new Error('Spotify player failed to connect');
    this.player = player;

    // Wait up to 5s for the 'ready' event to provide a device_id.
    const deadline = performance.now() + 5000;
    while (!this.deviceId && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!this.deviceId) {
      throw new Error('Spotify device did not become ready in time');
    }

    // Unlock audio while we're still inside the Connect button's
    // user-gesture chain. Browsers (esp. Safari) otherwise silently
    // mute any audio the SDK tries to produce later from an effect.
    await player.activateElement().catch(() => {});

    // Make our SDK device the active Spotify playback target. Without
    // this, a play call with ?device_id=<us> still routes audio to a
    // phone or desktop app that was previously active — the UI clock
    // ticks but the user hears nothing.
    await this.transferPlayback().catch(() => {});
  }

  private async transferPlayback(): Promise<void> {
    if (!this.token || !this.deviceId) return;
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [this.deviceId], play: false }),
    });
  }

  isAuthenticated(): boolean {
    return Boolean(this.token && this.deviceId);
  }

  async resolveTrack(track: CanonicalTrack): Promise<ProviderTrackHandle> {
    let uri: string | undefined = track.providerIds.spotify;

    // Guest path: a host on Apple Music broadcast a track with only
    // { apple: ... } in providerIds. We still have the ISRC (track.id),
    // so we can ask Spotify for an equivalent recording.
    if (!uri) {
      uri = (await this.lookupByIsrc(track.id)) ?? undefined;
      if (!uri) {
        throw new Error(
          `Spotify: no track for ISRC ${track.id} in this account's market`,
        );
      }
    }
    return {
      canonicalTrackId: track.id,
      provider: 'spotify',
      providerTrackId: uri,
    };
  }

  async search(query: string, limit = 8): Promise<CanonicalTrack[]> {
    if (!this.token) throw new Error('Spotify adapter not ready');
    const q = query.trim();
    if (!q) return [];
    const url =
      `https://api.spotify.com/v1/search?type=track&limit=${limit}` +
      `&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new Error(`Spotify search failed: ${res.status}`);
    }
    const body: SpotifySearchResponse = await res.json();
    // Spotify surfaces the same recording from multiple releases
    // (single + album + compilation). Same ISRC → same CanonicalTrack,
    // so we collapse to the first occurrence.
    const seen = new Set<string>();
    const out: CanonicalTrack[] = [];
    for (const t of body.tracks?.items ?? []) {
      const isrc = t.external_ids?.isrc;
      if (!isrc || seen.has(isrc)) continue;
      seen.add(isrc);
      out.push({
        id: isrc,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        album: t.album?.name,
        durationMs: t.duration_ms,
        providerIds: { spotify: t.uri },
        artworkUrl: pickArtwork(t.album?.images),
      });
    }
    return out;
  }

  private async lookupByIsrc(isrc: string): Promise<string | null> {
    if (!this.token) return null;
    const url =
      `https://api.spotify.com/v1/search?type=track&limit=1` +
      `&q=${encodeURIComponent(`isrc:${isrc}`)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) return null;
    const body: SpotifySearchResponse = await res.json();
    return body.tracks?.items?.[0]?.uri ?? null;
  }

  async play(handle: ProviderTrackHandle, positionMs: number): Promise<void> {
    if (!this.token || !this.deviceId) {
      throw new Error('Spotify adapter not ready');
    }
    // Some browsers gate audio on an explicit gesture activation. Safe
    // to call repeatedly — it only does work once.
    if (this.player) {
      await this.player.activateElement().catch(() => {});
    }

    // Fast path: same track is already queued on this device. Skip the
    // Web API round-trip (setQueue+play takes ~1-2s) and just tell the
    // local SDK to resume. Realign with a seek only if drift is real.
    if (
      this.currentCanonicalId === handle.canonicalTrackId &&
      this.player
    ) {
      const drift = Math.abs(this.getCurrentPositionMs() - positionMs);
      if (drift > 500) {
        await this.player
          .seek(Math.max(0, Math.floor(positionMs)))
          .catch(() => {});
      }
      await this.player.resume().catch(() => {});
      this.paused = false;
      this.lastPositionMs = positionMs;
      this.lastPositionAt = performance.now();
      this.emit();
      return;
    }

    // Re-transfer before the cold-path play: if the user opened the
    // Spotify app on another device mid-session, playback would silently
    // route there instead of to our SDK.
    await this.transferPlayback().catch(() => {});

    const url =
      `https://api.spotify.com/v1/me/player/play` +
      `?device_id=${encodeURIComponent(this.deviceId)}`;
    const init: RequestInit = {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uris: [handle.providerTrackId],
        position_ms: Math.max(0, Math.floor(positionMs)),
      }),
    };

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // "Failed to fetch" = TypeError from the network layer (DNS,
      // offline, blocked). Retry once before surfacing.
      await new Promise((r) => setTimeout(r, 400));
      try {
        res = await fetch(url, init);
      } catch (err2) {
        const msg = err2 instanceof Error ? err2.message : String(err2);
        throw new Error(`Spotify play network error: ${msg}`);
      }
    }
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => '');
      throw new Error(`Spotify play failed: ${res.status} ${text}`);
    }
    this.currentCanonicalId = handle.canonicalTrackId;
    this.paused = false;
    this.lastPositionMs = positionMs;
    this.lastPositionAt = performance.now();
    this.emit();
  }

  async pause(): Promise<void> {
    if (!this.player) return;
    // The SDK errors with "no list was loaded" if we pause before
    // anything has ever been queued (common on the very first clock
    // sync after a track loads at paused=true).
    if (!this.currentCanonicalId) return;
    await this.player.pause().catch(() => {});
  }

  async seek(positionMs: number): Promise<void> {
    if (!this.player) return;
    if (!this.currentCanonicalId) return;
    const clamped = Math.max(0, Math.floor(positionMs));
    await this.player.seek(clamped).catch(() => {});
    this.lastPositionMs = clamped;
    this.lastPositionAt = performance.now();
  }

  getCurrentPositionMs(): number {
    if (this.paused) return this.lastPositionMs;
    return this.lastPositionMs + (performance.now() - this.lastPositionAt);
  }

  onPlaybackStateChange(listener: PlaybackStateListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
    if (this.player) {
      this.player.disconnect();
      this.player = null;
    }
    this.deviceId = null;
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  private snapshot(): PlaybackState {
    return {
      canonicalTrackId: this.currentCanonicalId,
      positionMs: this.getCurrentPositionMs(),
      paused: this.paused,
      ready: this.deviceId !== null,
      connected: this.isAuthenticated(),
    };
  }
}

// Singleton so repeated getAdapter('spotify') doesn't spawn multiple SDK devices
// on the user's Spotify account.
let instance: SpotifyAdapter | null = null;
function spotifyFactory(): SpotifyAdapter {
  if (!instance) instance = new SpotifyAdapter();
  return instance;
}

registerAdapter('spotify', spotifyFactory);
