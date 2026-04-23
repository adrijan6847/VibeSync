/**
 * Cross-provider track matching. Shared by spotify.ts and apple.ts so
 * both adapters agree on what "same track" means when bridging between
 * catalogs by title+artist (the primary bridge — ISRCs drift between
 * releases and can't be trusted as a canonical identity).
 */

/**
 * Strip noise that isn't part of the recording's identity:
 *   - "(Remastered)", "(feat. X)", "(Live)", "(Radio Edit)" — any parenthetical
 *   - "[Bonus Track]", "[Deluxe]" — any bracket group
 *   - " - Remastered 2015", " - Live at X" — release qualifiers
 * Lowercase, collapse punctuation to spaces, squeeze whitespace.
 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(
      / - (remaster(ed)?|live|radio edit|single version|extended|mono|stereo|deluxe|bonus track)\b.*$/i,
      '',
    )
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduce an artist string to the primary credit. "Daft Punk feat. The
 * Weeknd" → "daft punk". Secondary credits differ across catalogs
 * ("ft." vs "feat." vs "&" vs not listed), so matching them exactly
 * hurts more than it helps.
 */
export function normalizeArtist(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*(feat\.|featuring|ft\.|&|with)\s.*/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Candidate = {
  title: string;
  artist: string;
  durationMs: number;
  providerTrackId: string;
};

/**
 * Pick the best candidate for `target`, or null if none qualifies.
 * Gates:
 *   - Title: exact match after normalizeTitle. Loosening title leads to
 *     wrong-song matches (same title different artist, unrelated track
 *     with a substring-matching name, etc.).
 *   - Artist: bidirectional substring match after normalizeArtist.
 *     Handles "Daft Punk" vs "Daft Punk, The Weeknd".
 *   - Duration: 5 s window gets full credit; linearly degrades to 15 s.
 *     Beyond 15 s the candidate is rejected (likely a live/edit variant).
 *
 * No fuzzy matching. No Levenshtein. Exact-or-reject on title.
 */
export function rankCandidates(
  target: { title: string; artist: string; durationMs: number },
  candidates: Candidate[],
): Candidate | null {
  const tNorm = normalizeTitle(target.title);
  const aNorm = normalizeArtist(target.artist);

  type Scored = { c: Candidate; score: number };
  const scored: Scored[] = [];

  for (const c of candidates) {
    const cTitle = normalizeTitle(c.title);
    if (cTitle !== tNorm) continue;

    const cArtist = normalizeArtist(c.artist);
    const artistMatch = cArtist.includes(aNorm) || aNorm.includes(cArtist);
    if (!artistMatch) continue;

    const deltaMs = Math.abs(c.durationMs - target.durationMs);
    const durationScore =
      deltaMs <= 5_000
        ? 1
        : deltaMs <= 15_000
          ? 1 - (deltaMs - 5_000) / 10_000
          : 0;
    if (durationScore === 0) continue;

    scored.push({ c, score: durationScore });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].c;
}
