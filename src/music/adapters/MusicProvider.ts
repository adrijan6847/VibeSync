/**
 * The adapter interface. This is the ONE place where a provider-specific
 * concrete class is allowed to reference its service by name; everything
 * else in the codebase operates on this interface.
 *
 * Implementations live in ./spotify.ts and ./apple.ts.
 */

import type {
  CanonicalTrack,
  PlaybackState,
  ProviderId,
  ProviderTrackHandle,
} from '../types';

export type PlaybackStateListener = (state: PlaybackState) => void;
export type Unsubscribe = () => void;

/**
 * Result of resolving a canonical track to a provider-specific handle.
 *
 * `ok: true` — the adapter found a playable track. `via` is a dev-only
 *   breadcrumb for which lookup strategy succeeded.
 *
 * `ok: false` with reason 'not_in_catalog' — an expected outcome, not a
 *   bug. The track simply isn't available in this account's market (or
 *   region, or tier). The UI should render a calm banner, not throw.
 *
 * Thrown errors are reserved for genuine failures: auth, network, rate
 * limit, account-tier mismatch. Those still surface to the dev overlay.
 */
export type ResolveResult =
  | {
      ok: true;
      handle: ProviderTrackHandle;
      via: 'direct_uri' | 'title_artist' | 'isrc';
    }
  | { ok: false; reason: 'not_in_catalog'; message: string };

export interface MusicProvider {
  readonly id: ProviderId;
  /** Display name for UI ("Spotify", "Apple Music"). */
  readonly displayName: string;

  /**
   * Begin authentication. Resolves once the adapter has a usable session
   * (OAuth token, MusicKit instance, iframe ready, etc.).
   */
  authenticate(): Promise<void>;

  /** True if this adapter currently has a usable session. */
  isAuthenticated(): boolean;

  /**
   * Resolve a canonical track to a provider-specific handle.
   *
   * Resolution order per adapter:
   *   1. Direct URI from track.providerIds[thisProvider] (free; zero net)
   *   2. Title+artist search filtered by duration (primary cross-provider bridge)
   *   3. ISRC lookup (hint only — races in parallel with #2)
   *
   * Returns a structured result. Only genuine errors throw.
   */
  resolveTrack(track: CanonicalTrack): Promise<ResolveResult>;

  /**
   * Free-text catalog search. Returns CanonicalTrack candidates the
   * caller can pass to load() + resolveTrack(). Each result carries
   * the ISRC as its id plus this provider's id in providerIds, so that
   * guests on a different provider can still resolve it.
   */
  search(query: string, limit?: number): Promise<CanonicalTrack[]>;

  /**
   * Play a resolved handle from positionMs. Idempotent: if the same
   * handle is already playing at ~positionMs, it's a no-op.
   */
  play(handle: ProviderTrackHandle, positionMs: number): Promise<void>;

  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;

  /** Current position reported by the underlying player, in ms. */
  getCurrentPositionMs(): number;

  /** Subscribe to playback state changes. Returns an unsubscribe fn. */
  onPlaybackStateChange(listener: PlaybackStateListener): Unsubscribe;

  /** Tear down any listeners, iframes, or tokens. */
  dispose(): Promise<void>;

  /**
   * Revoke any user-level grant (not the app-level dev token) and clear
   * any tokens this adapter persists across sessions. After this, a fresh
   * `authenticate()` forces the user to grant permission again.
   */
  signOut(): Promise<void>;
}
