/**
 * Spotify PKCE OAuth — the real consumer-facing "Sign in with Spotify" flow.
 *
 * Invariant: this module is the only place outside spotify.ts that knows
 * about Spotify-specific auth internals. The rest of the app talks to a
 * generic provider adapter.
 *
 * Flow:
 *   1. `startSpotifyLogin(returnTo)` mints a PKCE verifier + challenge,
 *      stashes them in sessionStorage alongside the return path, then
 *      redirects the browser to Spotify's authorize endpoint.
 *   2. Spotify redirects back to `SPOTIFY_REDIRECT_URI` with `?code=...`.
 *      Our callback page (see app/auth/spotify/callback/page.tsx) calls
 *      `completeSpotifyLogin()`.
 *   3. `completeSpotifyLogin()` exchanges the code for an access token,
 *      writes it to the same localStorage key the adapter already reads
 *      (`vs.spotify.token`), and returns the stored return-to path.
 *
 * Redirect URI note: Spotify's 2025 redirect-URI rules reject `localhost`
 * but accept loopback IPs. The default `http://127.0.0.1:3000/...` reflects
 * that. Override with NEXT_PUBLIC_SPOTIFY_REDIRECT_URI for production
 * (must match what you register in the Spotify developer dashboard).
 *
 * Setup: add to .env.local
 *   NEXT_PUBLIC_SPOTIFY_CLIENT_ID=<your client id>
 *   NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/spotify/callback
 */

import { setPendingProvider } from './index';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const TOKEN_STORAGE_KEY = 'vs.spotify.token';
const VERIFIER_STORAGE_KEY = 'vs.spotify.pkce_verifier';
const RETURN_TO_STORAGE_KEY = 'vs.spotify.pkce_return_to';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
].join(' ');

const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3000/auth/spotify/callback';

function redirectUri(): string {
  return process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

export function spotifyClientId(): string | null {
  return process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || null;
}

export function hasSpotifyClientId(): boolean {
  return spotifyClientId() !== null;
}

/**
 * Returns non-null when the page is served from a host that won't match
 * the registered redirect URI (e.g. user opened `localhost:3000` but the
 * redirect URI is `127.0.0.1:3000`). Lets the UI show a helpful switch link
 * instead of starting a flow that will fail at the callback step.
 */
export function spotifyHostMismatch():
  | { expectedOrigin: string; currentOrigin: string }
  | null {
  if (typeof window === 'undefined') return null;
  try {
    const expected = new URL(redirectUri());
    if (expected.host !== window.location.host) {
      return {
        expectedOrigin: `${expected.protocol}//${expected.host}`,
        currentOrigin: window.location.origin,
      };
    }
  } catch {
    // malformed redirect URI — treat as no mismatch so caller sees the real error
  }
  return null;
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateVerifier(byteLen = 48): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLen));
  return base64UrlEncode(bytes);
}

async function deriveChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

/**
 * Redirects the browser to Spotify's authorize endpoint. After the user
 * accepts, Spotify redirects back to the callback route, which will finish
 * the exchange and restore `returnTo`.
 *
 * `returnTo` should be a same-origin path (e.g. `/s/S354`).
 */
export async function startSpotifyLogin(returnTo: string): Promise<void> {
  const clientId = spotifyClientId();
  if (!clientId) {
    throw new Error('Spotify client id missing — set NEXT_PUBLIC_SPOTIFY_CLIENT_ID');
  }

  const verifier = generateVerifier();
  const challenge = await deriveChallenge(verifier);

  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
  sessionStorage.setItem(RETURN_TO_STORAGE_KEY, returnTo);
  setPendingProvider('spotify');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Called by the callback page once Spotify has redirected back. Exchanges
 * the authorization code for an access token and persists it. Returns the
 * original `returnTo` path so the caller can navigate back.
 */
export async function completeSpotifyLogin(
  search: URLSearchParams,
): Promise<{ returnTo: string }> {
  const errorParam = search.get('error');
  if (errorParam) {
    cleanupPkceSession();
    throw new Error(`Spotify denied the sign-in (${errorParam}).`);
  }

  const code = search.get('code');
  if (!code) {
    cleanupPkceSession();
    throw new Error('Spotify did not return an authorization code.');
  }

  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  if (!verifier) {
    throw new Error('Sign-in session expired. Try again from the app.');
  }

  const clientId = spotifyClientId();
  if (!clientId) {
    cleanupPkceSession();
    throw new Error('Spotify client id missing — set NEXT_PUBLIC_SPOTIFY_CLIENT_ID');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    cleanupPkceSession();
    throw new Error(`Spotify token exchange failed (${res.status}). ${text}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    cleanupPkceSession();
    throw new Error('Spotify returned no access token.');
  }

  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, json.access_token);
  } catch {
    // fall through — useMusicSession's selectProvider will surface the failure
  }

  const returnTo = sessionStorage.getItem(RETURN_TO_STORAGE_KEY) || '/';
  sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
  sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
  // The generic pending-provider key is cleared by the session UI once
  // it resumes the provider it stashed.

  return { returnTo };
}

function cleanupPkceSession(): void {
  try {
    sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
    sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
