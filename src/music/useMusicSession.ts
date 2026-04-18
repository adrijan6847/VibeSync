'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

  const adapterRef = useRef<MusicProvider | null>(null);
  const clockOffsetRef = useRef(clockOffsetMs);
  const clockRef = useRef(clock);

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
        const handle = await adapter.resolveTrack(nowPlaying);
        if (cancelled) return;
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

  // Drift correction while playing.
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !adapterReady || !nowPlaying || clock.paused) return;
    const id = window.setInterval(() => {
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
      if (Math.abs(target - actual) > DRIFT_NUDGE_MS) {
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
    selectProvider,
    load,
    play,
    pause,
    seek,
    search,
  };
}

export type { PlaybackState };
