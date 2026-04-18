/**
 * SyncClock helpers. The clock itself is plain data (see types.ts);
 * this module provides the derivation math every consumer needs.
 *
 * Design:
 *   - The server owns the SyncClock and broadcasts it on every transport
 *     change (play / pause / seek / load).
 *   - The existing session `clock:sync` handshake gives us a
 *     serverNow - clientNow offset in ms (already wired in useSession).
 *   - Clients never mutate the clock locally; they derive position from
 *     it via derivePositionMs().
 */

import type { SyncClock } from '../types';

export const EMPTY_CLOCK: SyncClock = {
  canonicalTrackId: null,
  startedAtWallClock: 0,
  positionAtStartMs: 0,
  rate: 1,
  paused: true,
  revision: 0,
};

/**
 * Compute live playback position from a clock and the current time.
 *
 * @param clock           Server-owned SyncClock snapshot.
 * @param nowClientMs     Date.now() on the client.
 * @param clockOffsetMs   serverNow - clientNow (from `clock:sync` handshake).
 */
export function derivePositionMs(
  clock: SyncClock,
  nowClientMs: number,
  clockOffsetMs: number,
): number {
  if (!clock.canonicalTrackId) return 0;
  if (clock.paused) return clock.positionAtStartMs;
  const nowServerMs = nowClientMs + clockOffsetMs;
  const elapsed = (nowServerMs - clock.startedAtWallClock) * clock.rate;
  return Math.max(0, clock.positionAtStartMs + elapsed);
}

/**
 * Build a clock snapshot for "play from position X right now".
 * Called on the server when the host hits play.
 */
export function clockForPlay(params: {
  canonicalTrackId: string;
  positionAtStartMs: number;
  serverNowMs: number;
  revision: number;
  rate?: number;
}): SyncClock {
  return {
    canonicalTrackId: params.canonicalTrackId,
    startedAtWallClock: params.serverNowMs,
    positionAtStartMs: params.positionAtStartMs,
    rate: params.rate ?? 1,
    paused: false,
    revision: params.revision,
  };
}

/**
 * Build a clock snapshot for "pause at derived position".
 * Called on the server when the host hits pause.
 */
export function clockForPause(params: {
  previous: SyncClock;
  serverNowMs: number;
  revision: number;
}): SyncClock {
  const frozen = derivePositionMs(params.previous, params.serverNowMs, 0);
  return {
    ...params.previous,
    positionAtStartMs: frozen,
    startedAtWallClock: params.serverNowMs,
    paused: true,
    revision: params.revision,
  };
}
