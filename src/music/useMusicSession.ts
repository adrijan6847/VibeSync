'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { extractPalette, type Palette } from '@/lib/palette';
import { getSocket } from '@/lib/socket';
import '@/music/adapters/register';
import { getAdapter, hasAdapter } from './adapters';
import type { MusicProvider } from './adapters/MusicProvider';
import { EMPTY_CLOCK, derivePositionMs } from './sync/SyncClock';
import {
  MUSIC_EVENTS,
  type MusicControlEvent,
  type MusicLoadEvent,
  type MusicStateEvent,
  type ProviderSelectEvent,
} from './sync/events';
import type {
  CanonicalTrack,
  PlaybackState,
  ProviderId,
  SyncClock,
} from './types';

export type MusicSnapshot = {
  nowPlaying: CanonicalTrack | null;
  clock: SyncClock;
  queue: CanonicalTrack[];
  provider: ProviderId | null;
  adapterReady: boolean;
  adapterError: string | null;
  /** 3-color palette extracted from the current track's cover art. null
   *  while none is loaded or on CORS/decode failure. */
  palette: Palette | null;
  /** 0..1 normalized playhead position. Holds last value while paused;
   *  resets to 0 on track change. */
  playheadPhase: number;
  /** Live playhead in ms. Updated ≤ 4 Hz (set only when Δ ≥ 250 ms).
   *  Holds last value while paused; resets to 0 on track change. */
  positionMs: number;
  /** |target − adapter.getCurrentPositionMs()| from the drift interval,
   *  surfaced for the SYNCED indicator. Updated ≤ 2 Hz. */
  driftMs: number;
  /** Populated when the current provider can't play nowPlaying (catalog
   *  miss after trying direct URI, title+artist, and ISRC lookup). Not
   *  an error — an expected outcome; the UI shows a calm banner. Clears
   *  on the next track swap. */
  trackUnavailable: { reason: 'not_in_catalog'; message: string } | null;
};

export type MusicActions = {
  selectProvider: (id: ProviderId) => Promise<void>;
  load: (track: CanonicalTrack) => void;
  play: () => void;
  pause: () => void;
  seek: (positionMs: number) => void;
  /** Provider-agnostic catalog search via the currently-selected adapter. */
  search: (query: string, limit?: number) => Promise<CanonicalTrack[]>;
};

export type UseMusicSessionParams = {
  /** serverNow - clientNow offset in ms, from useSession's clock:sync handshake. */
  clockOffsetMs: number;
};

// Loosened from 250 → 600 because tighter thresholds forced mid-playback
// seeks that briefly cut audio on both Apple and Spotify. 600ms is still
// inside "tapping together" tolerance for a party.
const DRIFT_NUDGE_MS = 600;
const DRIFT_INTERVAL_MS = 800;

export function useMusicSession(
  { clockOffsetMs }: UseMusicSessionParams,
): MusicSnapshot & MusicActions {
  const [nowPlaying, setNowPlaying] = useState<CanonicalTrack | null>(null);
  const [clock, setClock] = useState<SyncClock>(EMPTY_CLOCK);
  const [queue, setQueue] = useState<CanonicalTrack[]>([]);
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [adapterReady, setAdapterReady] = useState(false);
  const [adapterError, setAdapterError] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [playheadPhase, setPlayheadPhase] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [driftMs, setDriftMs] = useState(0);
  const [trackUnavailable, setTrackUnavailable] = useState<
    { reason: 'not_in_catalog'; message: string } | null
  >(null);

  const adapterRef = useRef<MusicProvider | null>(null);
  const clockOffsetRef = useRef(clockOffsetMs);
  const clockRef = useRef(clock);
  const lastDriftSetRef = useRef(0);

  useEffect(() => {
    clockOffsetRef.current = clockOffsetMs;
  }, [clockOffsetMs]);
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  // music:state → local
  useEffect(() => {
    const s = getSocket();
    const onState = (ev: MusicStateEvent) => {
      setNowPlaying(ev.nowPlaying);
      setClock(ev.clock);
      setQueue(ev.queue);
    };
    s.on(MUSIC_EVENTS.state, onState);
    return () => {
      s.off(MUSIC_EVENTS.state, onState);
    };
  }, []);

  // Drive the adapter to match server clock.
  // Runs on every transport change or track swap, and again when the
  // adapter becomes ready (so a late provider selection still catches up).
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !adapterReady || !nowPlaying) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await adapter.resolveTrack(nowPlaying);
        if (cancelled) return;

        if (!result.ok) {
          // Expected outcome — this provider doesn't have the track in
          // its catalog for this account's market. No throw, no console
          // noise: the UI surfaces a banner and the other participants
          // still hear the music.
          setTrackUnavailable({
            reason: result.reason,
            message: result.message,
          });
          await adapter.pause().catch(() => {});
          return;
        }

        setTrackUnavailable(null);
        const handle = result.handle;
        if (clock.paused) {
          await adapter.pause().catch(() => {});
          const target = clock.positionAtStartMs;
          const actual = adapter.getCurrentPositionMs();
          if (Math.abs(target - actual) > DRIFT_NUDGE_MS) {
            await adapter.seek(target).catch(() => {});
          }
        } else {
          const target = derivePositionMs(
            clock,
            Date.now(),
            clockOffsetRef.current,
          );
          await adapter.play(handle, target);
        }
      } catch (err) {
        console.error('[music] failed to apply clock to adapter', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clock.revision, clock.paused, nowPlaying?.id, adapterReady]);

  // Extract a 3-color palette from the current cover art. Module-level
  // cache in palette.ts means a track swap back to a previously-seen
  // cover is free; first hit is a single 32×32 pixel-bucket pass.
  useEffect(() => {
    const url = nowPlaying?.artworkUrl;
    if (!url) {
      setPalette(null);
      return;
    }
    let cancelled = false;
    extractPalette(url).then((p) => {
      if (!cancelled) setPalette(p);
    });
    return () => {
      cancelled = true;
    };
  }, [nowPlaying?.artworkUrl]);

  // Reset playhead state on track change so the next track starts at 0.
  // Also clears the catalog-miss banner — the new track gets a fresh
  // resolve attempt.
  useEffect(() => {
    setPlayheadPhase(0);
    setPositionMs(0);
    setDriftMs(0);
    setTrackUnavailable(null);
  }, [nowPlaying?.id]);

  // RAF playhead in ms. Throttled to Δ ≥ 250 ms so we set React state
  // ~4 times per second — enough for a smooth progress bar, cheap on
  // render cost. Pause / track change release the RAF.
  useEffect(() => {
    if (!nowPlaying || clock.paused) return;
    let raf = 0;
    let last = -Infinity;
    const loop = () => {
      const pos = derivePositionMs(
        clockRef.current,
        Date.now(),
        clockOffsetRef.current,
      );
      if (Math.abs(pos - last) >= 250) {
        last = pos;
        setPositionMs(pos);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [nowPlaying?.id, clock.paused]);

  // RAF-driven playhead phase (0..1). Throttled to ≥0.005 steps — ~200
  // React updates across a full track, plenty for a slow "breathing"
  // modulator. Pauses freeze the value in place.
  useEffect(() => {
    const duration = nowPlaying?.durationMs;
    if (!duration || clock.paused) return;
    let raf = 0;
    let last = -1;
    const loop = () => {
      const pos = derivePositionMs(
        clockRef.current,
        Date.now(),
        clockOffsetRef.current,
      );
      const p = Math.max(0, Math.min(1, pos / duration));
      if (Math.abs(p - last) >= 0.005) {
        last = p;
        setPlayheadPhase(p);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [nowPlaying?.id, nowPlaying?.durationMs, clock.paused]);

  // Drift correction while playing.
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !adapterReady || !nowPlaying || clock.paused) return;
    const id = window.setInterval(() => {
      // Background tabs throttle timers unevenly and the audio is almost
      // certainly muted anyway — drift corrections while hidden are
      // noise that ties up the adapter for no user-visible benefit. Skip
      // the body (don't clear the interval: re-creating it forces
      // re-entry into the warm-seek grace window below).
      if (typeof document !== 'undefined' && document.hidden) return;

      // Skip drift correction during the server's scheduled-start grace
      // window. The canonical clock is intentionally holding at
      // positionAtStartMs while adapters warm up, so the adapter's
      // growing audio position isn't "drift" — it's the real start, and
      // seeking back to 0 mid-warmup causes an audible cut-out.
      const nowServer = Date.now() + clockOffsetRef.current;
      if (clockRef.current.startedAtWallClock > nowServer) return;

      const target = derivePositionMs(
        clockRef.current,
        Date.now(),
        clockOffsetRef.current,
      );
      const actual = adapter.getCurrentPositionMs();
      const drift = Math.abs(target - actual);
      // Surface drift at ≤ 2 Hz so the SYNCED badge can color-code itself
      // without thrashing React on every drift check.
      const nowWall = Date.now();
      if (nowWall - lastDriftSetRef.current > 500) {
        lastDriftSetRef.current = nowWall;
        setDriftMs(drift);
      }
      if (drift > DRIFT_NUDGE_MS) {
        adapter.seek(target).catch(() => {});
      }
    }, DRIFT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [nowPlaying?.id, clock.paused, adapterReady]);

  const selectProvider = useCallback(async (id: ProviderId) => {
    if (!hasAdapter(id)) {
      throw new Error(
        `Adapter "${id}" not registered — make sure register.ts imports it.`,
      );
    }
    const adapter = getAdapter(id);
    adapterRef.current = adapter;
    setProvider(id);
    setAdapterReady(false);
    setAdapterError(null);
    try {
      await adapter.authenticate();
      setAdapterReady(adapter.isAuthenticated());
      const payload: ProviderSelectEvent = { provider: id };
      getSocket().emit(MUSIC_EVENTS.providerSelect, payload);
    } catch (err) {
      setAdapterReady(false);
      setAdapterError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  const load = useCallback((track: CanonicalTrack) => {
    const p: MusicLoadEvent = { track };
    getSocket().emit(MUSIC_EVENTS.load, p);
  }, []);

  const search = useCallback(
    async (query: string, limit?: number): Promise<CanonicalTrack[]> => {
      const adapter = adapterRef.current;
      if (!adapter || !adapterReady) return [];
      return adapter.search(query, limit);
    },
    [adapterReady],
  );

  const play = useCallback(() => {
    const p: MusicControlEvent = { kind: 'play' };
    getSocket().emit(MUSIC_EVENTS.control, p);
  }, []);

  const pause = useCallback(() => {
    const p: MusicControlEvent = { kind: 'pause' };
    getSocket().emit(MUSIC_EVENTS.control, p);
  }, []);

  const seek = useCallback((positionMs: number) => {
    const p: MusicControlEvent = { kind: 'seek', positionMs };
    getSocket().emit(MUSIC_EVENTS.control, p);
  }, []);

  return {
    nowPlaying,
    clock,
    queue,
    provider,
    adapterReady,
    adapterError,
    palette,
    playheadPhase,
    positionMs,
    driftMs,
    trackUnavailable,
    selectProvider,
    load,
    play,
    pause,
    seek,
    search,
  };
}

export type { PlaybackState };
