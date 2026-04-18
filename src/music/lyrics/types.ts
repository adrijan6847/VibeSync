/**
 * Lyrics layer — provider-independent.
 *
 * Lyrics are keyed by CanonicalTrack (via its ISRC / title+artist),
 * never by provider. Source in Phase 4 will be LRCLIB (free, no auth);
 * the layer can swap sources without changing the consumer API.
 */

import type { LyricsLine } from '../types';

export type { LyricsLine };

export type LyricsTrack = {
  canonicalTrackId: string;
  lines: LyricsLine[];
  /** True if the lines carry real timing (not just plain-text lyrics). */
  synced: boolean;
};

/**
 * Pick the current line for a given playback position.
 * Binary-search-friendly shape; the simple linear implementation is
 * in Phase 4 since line counts are small (<200 lines per song).
 */
export function lineForPosition(
  lyrics: LyricsTrack,
  positionMs: number,
): LyricsLine | null {
  if (!lyrics.synced || lyrics.lines.length === 0) return null;
  let match: LyricsLine | null = null;
  for (const line of lyrics.lines) {
    if (line.startMs <= positionMs && positionMs < line.endMs) {
      return line;
    }
    if (line.startMs <= positionMs) match = line;
  }
  return match;
}
