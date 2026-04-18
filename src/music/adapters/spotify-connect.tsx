/**
 * Spotify connect UI — two tiers of auth:
 *
 *   1. Primary: real PKCE "Sign in with Spotify" (startSpotifyLogin).
 *      Kicks off when the user taps Continue and no usable token is
 *      already cached. Requires NEXT_PUBLIC_SPOTIFY_CLIENT_ID.
 *
 *   2. Hidden fallback: paste a Web Playback SDK token directly. Lives
 *      behind a "developer mode" disclosure so the primary surface stays
 *      consumer-grade. Kept functional for hackathons and for debugging
 *      PKCE issues.
 */

'use client';

import { useState } from 'react';
import { getAdapter } from './index';
import { registerConnectUI, type ConnectUIProps } from './connect';
import {
  hasSpotifyClientId,
  spotifyHostMismatch,
  startSpotifyLogin,
} from './spotify-auth';

const TOKEN_STORAGE_KEY = 'vs.spotify.token';
const TOKEN_HELPER_URL =
  `https://developer.spotify.com/documentation/web-playback-sdk`;

function SpotifyConnect({ onAuthenticated, onCancel }: ConnectUIProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);

  async function tryConnect(tokenOverride?: string) {
    setBusy(true);
    setError(null);
    try {
      if (tokenOverride) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, tokenOverride);
      }
      const adapter = getAdapter('spotify');
      await adapter.authenticate();
      if (!adapter.isAuthenticated()) {
        throw new Error('not_ready');
      }
      onAuthenticated();
      return;
    } catch {
      if (tokenOverride) {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setError('That key didn’t work. Double-check it and try again.');
        setBusy(false);
        return;
      }
    }

    // Cached token didn't work (or wasn't there). Start real OAuth if
    // configured; otherwise reveal the developer-mode fallback.
    if (hasSpotifyClientId()) {
      const mismatch = spotifyHostMismatch();
      if (mismatch) {
        setError(
          `Spotify sign-in only works from ${mismatch.expectedOrigin}. ` +
            `Open that URL and try again.`,
        );
        setBusy(false);
        return;
      }
      try {
        const returnTo = window.location.pathname + window.location.search;
        await startSpotifyLogin(returnTo);
        // Browser navigates away — nothing else to do.
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } else {
      setError(
        'Couldn’t connect to Spotify automatically. Use developer mode below.',
      );
      setDevOpen(true);
    }
    setBusy(false);
  }

  return (
    <div className="panel rounded-2xl p-6">
      <h2 className="text-[15px] font-medium tracking-[-0.01em] text-white">
        Connect Spotify
      </h2>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--fg-soft)]">
        Sign in to play in sync with the room.
      </p>

      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={() => tryConnect()}
          disabled={busy}
          className="rounded-xl bg-white px-5 py-2.5 text-[13px] font-medium text-[#0a0a0a] transition-colors duration-200 hover:bg-[#f2f7fc] disabled:opacity-60"
        >
          {busy ? 'Connecting…' : 'Continue'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="label-caps rounded-xl px-3 py-2.5 text-[var(--fg-mute)] transition-colors duration-200 hover:text-[var(--fg-soft)] disabled:opacity-60"
          >
            back
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 text-[11.5px] leading-snug text-[var(--fg-soft)]">
          {error}
        </div>
      )}

      <div className="mt-5 border-t border-[var(--stroke)] pt-3">
        <button
          onClick={() => setDevOpen((v) => !v)}
          className="label-caps text-[var(--fg-mute)] transition-colors duration-200 hover:text-[var(--fg-soft)]"
        >
          {devOpen ? 'hide developer mode' : 'having trouble? developer mode'}
        </button>

        {devOpen && <DevPaste busy={busy} onSubmit={(t) => tryConnect(t)} />}
      </div>
    </div>
  );
}

function DevPaste({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (token: string) => void;
}) {
  const [token, setToken] = useState('');
  return (
    <div className="mt-3">
      <p className="text-[11.5px] leading-snug text-[var(--fg-soft)]">
        Paste a Web Playback SDK token from the{' '}
        <a
          href={TOKEN_HELPER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[var(--stroke-strong)] underline-offset-2 hover:text-white"
        >
          Spotify docs
        </a>
        . Stored in this browser only.
      </p>
      <input
        type="password"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="BQC…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={busy}
        className="mono mt-2 w-full rounded-xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-[12.5px] text-white placeholder:text-[var(--fg-weak)] focus:border-[var(--stroke-strong)] focus:outline-none"
      />
      <button
        onClick={() => token.trim() && onSubmit(token.trim())}
        disabled={busy || !token.trim()}
        className="label-caps mt-2 rounded-xl border border-[var(--stroke)] px-3 py-2 text-[var(--fg-soft)] transition-colors duration-200 hover:border-[var(--stroke-strong)] disabled:opacity-50"
      >
        {busy ? 'connecting…' : 'use this key'}
      </button>
    </div>
  );
}

registerConnectUI('spotify', SpotifyConnect);
