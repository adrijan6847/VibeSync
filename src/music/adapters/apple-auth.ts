/**
 * Apple Music developer-token discovery.
 *
 * Invariant: this module (plus apple.ts, apple-connect.tsx) is the only
 * place outside the adapter layer that knows about Apple Music auth
 * internals.
 *
 * Apple's MusicKit auth model is two-layer:
 *   1. Developer token (ES256 JWT signed with a private key from Apple
 *      Developer). Proves the *app* is authorized to call the Apple
 *      Music API. In production, this is minted server-side; for the
 *      hackathon build we accept a pre-minted long-lived JWT via env var
 *      or a paste in "developer mode".
 *   2. User token. Returned by MusicKit's own authorize() modal after
 *      the user signs in with their Apple Music subscription. Handled
 *      inside apple.ts — no app code runs during that modal.
 *
 * We expose only the developer-token side here. The user-token side is
 * opaque to the connect UI: apple.ts's authenticate() either resolves
 * (user accepted) or throws (user declined / not subscribed / SDK error).
 *
 * Setup: add to .env.local
 *   NEXT_PUBLIC_APPLE_DEVELOPER_TOKEN=<signed ES256 JWT>
 *
 * See https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens
 */

const TOKEN_STORAGE_KEY = 'vs.apple.devtoken';

/**
 * Returns the developer token from env var first, then localStorage.
 * Env var wins so a configured consumer build doesn't get overridden
 * by stale dev-mode paste data.
 */
export function appleDeveloperToken(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_APPLE_DEVELOPER_TOKEN;
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * True when a developer token is available via *any* source. Used by
 * the connect UI to decide whether the primary Continue button has a
 * shot at succeeding, or whether we need to reveal the dev-mode paste.
 */
export function hasAppleDeveloperToken(): boolean {
  return appleDeveloperToken() !== null;
}

/**
 * Stash a developer token (from the dev-mode paste) so the adapter
 * picks it up on the next authenticate() call. Scoped to this browser.
 */
export function setAppleDeveloperTokenOverride(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // fall through — caller will see the subsequent authenticate() failure
  }
}

export function clearAppleDeveloperTokenOverride(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
