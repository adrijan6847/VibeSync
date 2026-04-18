/**
 * Core music-layer types. Provider-agnostic by construction.
 *
 * Rule: anything that names a specific music service ("spotify", "apple")
 * belongs in src/music/adapters/*. Everything outside that folder operates
 * on CanonicalTrack + SyncClock + PlaybackState.
 */

export type ProviderId = 'spotify' | 'apple';

/**
 * A track in its universal, provider-free form.
 *
 * `id` is the ISRC (International Standard Recording Code) — the
 * cross-service identity of a recording. `providerIds` is the lookup
 * table for each service's internal identifier (URI, catalog ID, video ID).
 */
export type CanonicalTrack = {
  /** ISRC. e.g. "USSM18900001" */
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  /** Provider-internal IDs. At least one entry must be present. */
  providerIds: Partial<Record<ProviderId, string>>;
  artworkUrl?: string;
  /** Optional cache key for pre-fetched beat/section analysis. */
  analysisRef?: string;
  /** Optional hint for the lyrics layer (title/artist usually sufficient). */
  lyricsRef?: string;
};

/**
 * Shared transport clock. Wall-clock based — not position-rebroadcast —
 * so that different providers with different position granularities can
 * all align against the same moment without rebroadcast chatter.
 *
 * Live position:
 *   paused      → positionAtStartMs
 *   playing     → (Date.now() + clockOffset - startedAtWallClock) * rate
 *                  + positionAtStartMs
 */
export type SyncClock = {
  canonicalTrackId: string | null;
  /** Server wall-clock ms at which positionAtStartMs was true. */
  startedAtWallClock: number;
  positionAtStartMs: number;
  /** Playback rate. 1.0 default. Reserved. */
  rate: number;
  paused: boolean;
  /** Monotonic revision; increments on every transport change. */
  revision: number;
};

/**
 * Opaque per-provider handle returned by resolveTrack().
 * Consumers treat this as a sealed envelope passed back to play().
 */
export type ProviderTrackHandle = {
  canonicalTrackId: string;
  provider: ProviderId;
  /** Provider-internal identifier (URI, catalog ID, video ID, ...). */
  providerTrackId: string;
  /** Adapter-private payload (device ID, iframe ref, etc.). */
  meta?: unknown;
};

/** Playback state reported upward by an adapter. All timing in ms. */
export type PlaybackState = {
  canonicalTrackId: string | null;
  positionMs: number;
  paused: boolean;
  /** Adapter is ready to accept play/seek. */
  ready: boolean;
  /** Player believes it's connected to its service. */
  connected: boolean;
};

/** A single time-coded lyric line, provider-free. */
export type LyricsLine = {
  /** Zero-based index. */
  idx: number;
  /** Start time in ms from track start. */
  startMs: number;
  /** End time in ms; typically the start of the next line. */
  endMs: number;
  text: string;
};

/**
 * A session participant with their chosen provider.
 * Mirrors src/lib/types.ts `Participant`, extended with provider.
 * Kept separate so the music layer doesn't depend back on src/lib/types.
 */
export type SessionParticipant = {
  id: string;
  hue: number;
  taps: number;
  joinedAt: number;
  /** Provider the participant plays through. null until they pick. */
  provider: ProviderId | null;
};

/**
 * Extended session state covering music state.
 * The existing ClientState (lib/types.ts) remains authoritative for
 * session/energy/phase; MusicSessionState is the orthogonal music slice.
 */
export type MusicSessionState = {
  nowPlaying: CanonicalTrack | null;
  clock: SyncClock;
  queue: CanonicalTrack[];
};
