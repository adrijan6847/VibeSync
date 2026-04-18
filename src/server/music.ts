/**
 * Server-side music authority. Holds the authoritative SyncClock per
 * session and rebroadcasts on every transport change.
 *
 * Provider-agnostic: the server never knows which service any client
 * plays through; it only keeps the CanonicalTrack + SyncClock.
 */

import type { Server, Socket } from 'socket.io';
import {
  MUSIC_EVENTS,
  type MusicControlEvent,
  type MusicLoadEvent,
  type MusicStateEvent,
} from '../music/sync/events';
import {
  EMPTY_CLOCK,
  clockForPause,
  clockForPlay,
} from '../music/sync/SyncClock';
import type { CanonicalTrack, SyncClock } from '../music/types';

type MusicSession = {
  nowPlaying: CanonicalTrack | null;
  clock: SyncClock;
  queue: CanonicalTrack[];
};

const sessionMusic = new Map<string, MusicSession>();

/**
 * Grace window between a play command and the audible start. Every
 * provider (Spotify Web API setQueue+play, Apple MusicKit setQueue,
 * raw SDK resume after OAuth) takes real time to warm up — anywhere
 * from 500ms to 1.5s. Scheduling startedAtWallClock this far in the
 * future gives adapters room to queue the track before the canonical
 * clock starts advancing, so the visible timeline and the audible
 * audio stay in lockstep instead of drifting apart.
 */
const PLAY_GRACE_MS = 1200;

export function ensureMusicSession(code: string): MusicSession {
  let m = sessionMusic.get(code);
  if (!m) {
    m = { nowPlaying: null, clock: { ...EMPTY_CLOCK }, queue: [] };
    sessionMusic.set(code, m);
  }
  return m;
}

export function disposeMusicSession(code: string): void {
  sessionMusic.delete(code);
}

export function toMusicState(m: MusicSession): MusicStateEvent {
  return {
    nowPlaying: m.nowPlaying,
    clock: m.clock,
    queue: m.queue,
  };
}

/**
 * Attach music event handlers to a socket. Caller provides a thunk
 * that returns the socket's current session code + host status so
 * authorization is checked at the moment of each event, not at attach time.
 *
 * Returns a teardown function.
 */
export function attachMusicHandlers(
  io: Server,
  socket: Socket,
  getState: () => { code: string | null; isHost: boolean },
): () => void {
  const onLoad = (ev: MusicLoadEvent) => {
    const { code, isHost } = getState();
    if (!code || !isHost) return;
    const track = ev?.track;
    // Minimum contract: an ISRC id, a duration, and at least one
    // provider handle so some participant can resolve + play it.
    if (
      !track ||
      typeof track.id !== 'string' ||
      !track.id ||
      typeof track.durationMs !== 'number' ||
      !track.providerIds ||
      Object.keys(track.providerIds).length === 0
    ) {
      return;
    }
    const m = ensureMusicSession(code);
    m.nowPlaying = track;
    m.clock = {
      canonicalTrackId: track.id,
      startedAtWallClock: Date.now(),
      positionAtStartMs: 0,
      rate: 1,
      paused: true,
      revision: m.clock.revision + 1,
    };
    io.to(code).emit(MUSIC_EVENTS.state, toMusicState(m));
  };

  const onControl = (ev: MusicControlEvent) => {
    const { code, isHost } = getState();
    if (!code || !isHost) return;
    const m = ensureMusicSession(code);
    if (!m.nowPlaying) return;
    const now = Date.now();
    if (ev.kind === 'play') {
      m.clock = clockForPlay({
        canonicalTrackId: m.nowPlaying.id,
        positionAtStartMs: m.clock.positionAtStartMs,
        serverNowMs: now + PLAY_GRACE_MS,
        revision: m.clock.revision + 1,
      });
    } else if (ev.kind === 'pause') {
      m.clock = clockForPause({
        previous: m.clock,
        serverNowMs: now,
        revision: m.clock.revision + 1,
      });
    } else if (ev.kind === 'seek') {
      const clamped = Math.max(
        0,
        Math.min(ev.positionMs, m.nowPlaying.durationMs),
      );
      m.clock = m.clock.paused
        ? {
            ...m.clock,
            positionAtStartMs: clamped,
            startedAtWallClock: now,
            revision: m.clock.revision + 1,
          }
        : clockForPlay({
            canonicalTrackId: m.nowPlaying.id,
            positionAtStartMs: clamped,
            serverNowMs: now + PLAY_GRACE_MS,
            revision: m.clock.revision + 1,
          });
    }
    io.to(code).emit(MUSIC_EVENTS.state, toMusicState(m));
  };

  socket.on(MUSIC_EVENTS.load, onLoad);
  socket.on(MUSIC_EVENTS.control, onControl);

  return () => {
    socket.off(MUSIC_EVENTS.load, onLoad);
    socket.off(MUSIC_EVENTS.control, onControl);
  };
}
