/**
 * Wire-format event shapes for the music layer.
 *
 * The existing session events (`session:create`, `session:join`, `tick`,
 * `state`, `drop`) live in src/server/sessions.ts. The music layer adds
 * its own namespace: `music:*`.
 */

import type { CanonicalTrack, ProviderId, SyncClock } from '../types';

/**
 * Host → server: load a canonical track into the session.
 *
 * The full CanonicalTrack is sent (not just an id), because search
 * results are discovered at runtime and may not exist in any static
 * catalog. The server trusts the host's payload: each participant's
 * adapter still resolves the track locally (by ISRC via providerIds)
 * at playback time, so no credentials cross the wire.
 */
export type MusicLoadEvent = { track: CanonicalTrack };

/** Host → server: transport commands. */
export type MusicControlEvent =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'seek'; positionMs: number };

/** Server → room: authoritative music slice broadcast. */
export type MusicStateEvent = {
  nowPlaying: CanonicalTrack | null;
  clock: SyncClock;
  queue: CanonicalTrack[];
};

/** Client → server: participant announces their provider selection. */
export type ProviderSelectEvent = { provider: ProviderId };

/** Event names. Keep centralized so server/client agree. */
export const MUSIC_EVENTS = {
  load: 'music:load',
  control: 'music:control',
  state: 'music:state',
  providerSelect: 'music:provider',
} as const;
