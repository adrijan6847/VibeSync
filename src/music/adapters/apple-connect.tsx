/**
 * Apple Music connect UI — two tiers of auth:
 *
 *   1. Primary: real MusicKit sign-in. Requires a developer JWT via
 *      NEXT_PUBLIC_APPLE_DEVELOPER_TOKEN (or the dev-mode paste). When
 *      Continue is pressed we configure MusicKit and call authorize(),
 *      which opens Apple's own modal for the user to sign in with
 *      their Apple Music subscription.
 *
 *   2. Hidden fallback: paste a developer JWT directly. Lives behind a
 *      "developer mode" disclosure. Kept functional for hackathons and
 *      for debugging MusicKit issues.
 *
 * Unlike Spotify, MusicKit doesn't redirect the browser — the sign-in
 * modal runs in-page, so there's no callback route.
 */

'use client';

import { useState } from 'react';
import { getAdapter } from './index';
import { registerConnectUI, type ConnectUIProps } from './connect';
import {
  clearAppleDeveloperTokenOverride,
  hasAppleDeveloperToken,
  setAppleDeveloperTokenOverride,
} from './apple-auth';

const TOKEN_HELPER_URL =
  'https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens';

function AppleConnect({ onAuthenticated, onCancel }: ConnectUIProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);

  async function tryConnect(tokenOverride?: string) {
    setBusy(true);
    setError(null);
    try {
      if (tokenOverride) {
        setAppleDeveloperTokenOverride(tokenOverride);
      }
      const adapter = getAdapter('apple');
      await adapter.authenticate();
      if (!adapter.isAuthenticated()) {
        throw new Error('not_ready');
      }
      onAuthenticated();
      return;
    } catch (err) {
      if (tokenOverride) {
        clearAppleDeveloperTokenOverride();
        setError('That key didn’t work. Double-check it and try again.');
        setBusy(false);
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'apple_devtoken_missing' || !hasAppleDeveloperToken()) {
        // No developer token configured — fall back to the paste UI.
        setError(
          'Couldn’t connect to Apple Music automatically. Use developer mode below.',
        );
        setDevOpen(true);
      } else {
        // Token present but MusicKit's user modal rejected. Likely the
        // user cancelled, has no subscription, or hit a transient error.
        // Show a real message and let them retry — don't bury in dev mode.
        setError(friendlyAppleError(msg));
      }
    }
    setBusy(false);
  }

  return (
    <div className="panel rounded-2xl p-6">
      <h2 className="text-[15px] font-medium tracking-[-0.01em] text-white">
        Connect Apple Music
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
        Paste a MusicKit token from the{' '}
        <a
          href={TOKEN_HELPER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[var(--stroke-strong)] underline-offset-2 hover:text-white"
        >
          Apple docs
        </a>
        . Stored in this browser only.
      </p>
      <input
        type="password"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="eyJ…"
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

/**
 * MusicKit throws a grab-bag of errors from authorize(). We surface the
 * common ones (user cancel, missing subscription) as actionable copy;
 * anything else falls through as a generic retry prompt rather than
 * leaking MusicKit internals to the user.
 */
function friendlyAppleError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('cancel')) {
    return 'Sign-in was cancelled. Tap Continue to try again.';
  }
  if (lower.includes('subscription')) {
    return 'An active Apple Music subscription is required to join.';
  }
  if (lower.includes('authoriz')) {
    return 'Apple Music didn’t authorize the request. Try again.';
  }
  return 'Couldn’t reach Apple Music. Try again in a moment.';
}

registerConnectUI('apple', AppleConnect);
