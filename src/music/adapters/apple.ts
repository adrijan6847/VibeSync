/**
 * Apple Music adapter — MusicKit JS v3.
 *
 * ALL Apple-specific code belongs in this file.
 *
 * Auth (Phase 3 scope):
 *   1. A developer JWT signed with the user's MusicKit key (ES256).
 *      Stored in localStorage under `vs.apple.devtoken`. The connect UI
 *      (apple-connect.tsx) handles the paste.
 *   2. User-level `authorize()` call — MusicKit opens its own modal to
 *      link the user's Apple Music subscription to this session.
 *
 * Requires: Apple Developer account + MusicKit identifier + private key
 * to mint the developer token; user needs an active Apple Music
 * subscription to actually play catalog tracks.
 */

import type {
  CanonicalTrack,
  PlaybackState,
  ProviderTrackHandle,
} from '../types';
import type {
  MusicProvider,
  PlaybackStateListener,
  ResolveResult,
  Unsubscribe,
} from './MusicProvider';
import { rankCandidates, type Candidate } from './matching';
import { registerAdapter } from './index';
import { appleDeveloperToken } from './apple-auth';

// Dev-only breadcrumb for resolveTrack strategies.
function logVia(
  track: { title: string; artist: string },
  via: 'direct_uri' | 'title_artist' | 'isrc',
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.debug(`[apple.resolve] "${track.title}" / ${track.artist} via ${via}`);
}

const SDK_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

type AppleArtwork = { url: string; width?: number; height?: number };
type AppleSongAttributes = {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis: number;
  isrc?: string;
  artwork?: AppleArtwork;
};
type AppleCatalogSong = {
  id: string;
  type: string;
  attributes?: AppleSongAttributes;
};
type AppleApiResponse = {
  data: { data: AppleCatalogSong[] };
};
type AppleSearchResponse = {
  data: {
    results: {
      songs?: { data: AppleCatalogSong[] };
    };
  };
};

function formatAppleArtwork(
  artwork: AppleArtwork | undefined,
  size = 256,
): string | undefined {
  if (!artwork?.url) return undefined;
  return artwork.url
    .replace('{w}', String(size))
    .replace('{h}', String(size));
}

type MusicKitInstance = {
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  readonly isAuthorized: boolean;
  readonly storefrontId: string;
  setQueue(opts: { songs: string[] }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekToTime(seconds: number): Promise<void>;
  readonly currentPlaybackTime: number;
  readonly playbackState: number;
  addEventListener(event: string, cb: (e: unknown) => void): void;
  removeEventListener(event: string, cb: (e: unknown) => void): void;
  api: {
    music(
      path: string,
      params?: Record<string, unknown>,
    ): Promise<AppleApiResponse | AppleSearchResponse>;
  };
};

type MusicKitGlobal = {
  configure(opts: {
    developerToken: string;
    app: { name: string; build: string };
  }): Promise<MusicKitInstance> | MusicKitInstance;
  getInstance(): MusicKitInstance | null;
};

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

let sdkPromise: Promise<MusicKitGlobal> | null = null;
function loadSDK(): Promise<MusicKitGlobal> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('MusicKit is browser-only'));
      return;
    }
    if (window.MusicKit) {
      resolve(window.MusicKit);
      return;
    }
    const onLoaded = () => {
      if (window.MusicKit) resolve(window.MusicKit);
      else reject(new Error('MusicKit loaded without global'));
    };
    document.addEventListener('musickitloaded', onLoaded, { once: true });
    const el = document.createElement('script');
    el.src = SDK_SRC;
    el.async = true;
    el.onerror = () => reject(new Error('Failed to load MusicKit JS'));
    document.head.appendChild(el);
  });
  return sdkPromise;
}

class AppleAdapter implements MusicProvider {
  readonly id = 'apple' as const;
  readonly displayName = 'Apple Music';

  private devToken: string | null = null;
  private music: MusicKitInstance | null = null;
  private listeners = new Set<PlaybackStateListener>();

  // Bound handler refs so we can removeEventListener on the MusicKit
  // singleton before nulling `this.music`. MusicKit keeps its own event
  // table keyed by callback reference — inline arrows leave dangling
  // closures that fire for every sign-out/sign-in cycle the page lives
  // through, leaking state into each new authenticate().
  private handlePlaybackStateDidChange: (() => void) | null = null;
  private handlePlaybackTimeDidChange: (() => void) | null = null;

  private currentCanonicalId: string | null = null;
  private paused = true;

  async authenticate(): Promise<void> {
    this.devToken = appleDeveloperToken();
    if (!this.devToken) {
      throw new Error('apple_devtoken_missing');
    }
    const MK = await loadSDK();
    const music = await Promise.resolve(
      MK.configure({
        developerToken: this.devToken,
        app: { name: 'VibeSync', build: '1.0.0' },
      }),
    );
    if (!music.isAuthorized) {
      await music.authorize();
    }
    // MK.configure returns the same singleton instance across calls, so
    // a re-authenticate (sign-out then sign-in) would stack listeners.
    // Detach any we previously attached before wiring fresh handlers.
    this.detachMusicListeners();
    this.handlePlaybackStateDidChange = () => {
      this.paused = music.playbackState !== 2; // 2 = playing
      this.emit();
    };
    this.handlePlaybackTimeDidChange = () => {
      this.emit();
    };
    music.addEventListener(
      'playbackStateDidChange',
      this.handlePlaybackStateDidChange,
    );
    music.addEventListener(
      'playbackTimeDidChange',
      this.handlePlaybackTimeDidChange,
    );
    this.music = music;
  }

  isAuthenticated(): boolean {
    return Boolean(this.music?.isAuthorized);
  }

  async resolveTrack(track: CanonicalTrack): Promise<ResolveResult> {
    if (!this.music) throw new Error('Apple adapter not ready');

    // 1. Direct catalog ID from providerIds — host was on Apple; guest
    //    reuses the storefront-specific song ID directly.
    const directId = track.providerIds.apple;
    if (directId) {
      logVia(track, 'direct_uri');
      return {
        ok: true,
        via: 'direct_uri',
        handle: {
          canonicalTrackId: track.id,
          provider: 'apple',
          providerTrackId: directId,
        },
      };
    }

    // 2 + 3. Race title+artist search against ISRC lookup. Apple song
    //        IDs are storefront-specific; ISRCs drift across releases.
    //        Title+artist is the reliable bridge; ISRC is a hint.
    const [byTitleArtist, byIsrc] = await Promise.allSettled([
      this.searchByTitleArtist(track),
      this.lookupByIsrc(track.id),
    ]);

    if (byTitleArtist.status === 'fulfilled' && byTitleArtist.value) {
      logVia(track, 'title_artist');
      return {
        ok: true,
        via: 'title_artist',
        handle: {
          canonicalTrackId: track.id,
          provider: 'apple',
          providerTrackId: byTitleArtist.value,
        },
      };
    }
    if (byIsrc.status === 'fulfilled' && byIsrc.value) {
      logVia(track, 'isrc');
      return {
        ok: true,
        via: 'isrc',
        handle: {
          canonicalTrackId: track.id,
          provider: 'apple',
          providerTrackId: byIsrc.value,
        },
      };
    }

    return {
      ok: false,
      reason: 'not_in_catalog',
      message: `Can't play this track on Apple Music. Sitting this one out.`,
    };
  }

  private async searchByTitleArtist(
    track: CanonicalTrack,
  ): Promise<string | null> {
    if (!this.music) return null;
    const sf = this.music.storefrontId || 'us';
    const resp = (await this.music.api.music(`v1/catalog/${sf}/search`, {
      term: `${track.title} ${track.artist}`,
      types: 'songs',
      limit: 10,
    })) as AppleSearchResponse;
    const songs = resp?.data?.results?.songs?.data ?? [];
    const candidates: Candidate[] = songs
      .filter((s) => s.attributes)
      .map((s) => ({
        title: s.attributes!.name,
        artist: s.attributes!.artistName,
        durationMs: s.attributes!.durationInMillis,
        providerTrackId: s.id,
      }));
    const best = rankCandidates(
      {
        title: track.title,
        artist: track.artist,
        durationMs: track.durationMs,
      },
      candidates,
    );
    return best?.providerTrackId ?? null;
  }

  private async lookupByIsrc(isrc: string): Promise<string | null> {
    if (!this.music) return null;
    const sf = this.music.storefrontId || 'us';
    try {
      const resp = (await this.music.api.music(`v1/catalog/${sf}/songs`, {
        'filter[isrc]': isrc,
        limit: 1,
      })) as AppleApiResponse;
      return resp?.data?.data?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  async search(query: string, limit = 8): Promise<CanonicalTrack[]> {
    if (!this.music) throw new Error('Apple adapter not ready');
    const q = query.trim();
    if (!q) return [];
    const sf = this.music.storefrontId || 'us';
    const resp = (await this.music.api.music(
      `v1/catalog/${sf}/search`,
      { term: q, types: 'songs', limit },
    )) as AppleSearchResponse;
    const songs = resp?.data?.results?.songs?.data ?? [];
    // Collapse same-ISRC duplicates (single + album releases of the same recording).
    const seen = new Set<string>();
    const out: CanonicalTrack[] = [];
    for (const s of songs) {
      const isrc = s.attributes?.isrc;
      if (!isrc || seen.has(isrc)) continue;
      seen.add(isrc);
      out.push({
        id: isrc,
        title: s.attributes!.name,
        artist: s.attributes!.artistName,
        album: s.attributes!.albumName,
        durationMs: s.attributes!.durationInMillis,
        providerIds: { apple: s.id },
        artworkUrl: formatAppleArtwork(s.attributes!.artwork),
      });
    }
    return out;
  }

  async play(handle: ProviderTrackHandle, positionMs: number): Promise<void> {
    if (!this.music) throw new Error('Apple adapter not ready');

    // Fast path: same track already queued. Resume without re-queueing —
    // setQueue is the slow part, not play().
    if (this.currentCanonicalId === handle.canonicalTrackId) {
      const drift = Math.abs(this.getCurrentPositionMs() - positionMs);
      if (drift > 500) {
        await this.music.seekToTime(Math.max(0, positionMs / 1000)).catch(() => {});
      }
      await this.music.play().catch(() => {});
      this.paused = false;
      this.emit();
      return;
    }

    await this.music.setQueue({ songs: [handle.providerTrackId] });
    if (positionMs > 0) {
      await this.music.seekToTime(positionMs / 1000);
    }
    await this.music.play();
    this.currentCanonicalId = handle.canonicalTrackId;
    this.paused = false;
    this.emit();
  }

  async pause(): Promise<void> {
    if (!this.music) return;
    if (!this.currentCanonicalId) return;
    await this.music.pause().catch(() => {});
  }

  async seek(positionMs: number): Promise<void> {
    if (!this.music) return;
    if (!this.currentCanonicalId) return;
    await this.music.seekToTime(Math.max(0, positionMs / 1000)).catch(() => {});
  }

  getCurrentPositionMs(): number {
    return (this.music?.currentPlaybackTime ?? 0) * 1000;
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
    if (this.music) {
      await this.music.pause().catch(() => {});
      this.detachMusicListeners();
      this.music = null;
    }
  }

  async signOut(): Promise<void> {
    if (this.music) {
      await this.music.pause().catch(() => {});
      this.detachMusicListeners();
      await this.music.unauthorize().catch(() => {});
      this.music = null;
    }
    this.currentCanonicalId = null;
    this.paused = true;
    this.emit();
  }

  private detachMusicListeners(): void {
    if (!this.music) return;
    if (this.handlePlaybackStateDidChange) {
      this.music.removeEventListener(
        'playbackStateDidChange',
        this.handlePlaybackStateDidChange,
      );
      this.handlePlaybackStateDidChange = null;
    }
    if (this.handlePlaybackTimeDidChange) {
      this.music.removeEventListener(
        'playbackTimeDidChange',
        this.handlePlaybackTimeDidChange,
      );
      this.handlePlaybackTimeDidChange = null;
    }
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
      ready: this.isAuthenticated(),
      connected: this.isAuthenticated(),
    };
  }
}

let instance: AppleAdapter | null = null;
function appleFactory(): AppleAdapter {
  if (!instance) instance = new AppleAdapter();
  return instance;
}

registerAdapter('apple', appleFactory);
