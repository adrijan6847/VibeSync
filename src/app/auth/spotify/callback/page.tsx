'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeSpotifyLogin } from '@/music/adapters/spotify-auth';

/**
 * Registered callback for Spotify's PKCE flow. Finishes the token exchange,
 * stores the access token, then replaces the history entry with the path
 * the user was on before signing in so the browser Back button doesn't
 * drop them into the callback route.
 */
export default function SpotifyCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    completeSpotifyLogin(search)
      .then(({ returnTo }) => {
        router.replace(returnTo);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [router]);

  return (
    <main className="relative flex min-h-[100svh] items-center justify-center px-5">
      <div className="panel w-full max-w-[420px] rounded-2xl p-6 text-center">
        {error ? (
          <>
            <div className="label-caps text-[var(--fg-mute)]">sign-in failed</div>
            <p className="mt-2 text-[12.5px] leading-snug text-[var(--fg-soft)]">
              {error}
            </p>
            <button
              onClick={() => router.replace('/')}
              className="label-caps mt-4 rounded-xl border border-[var(--stroke)] px-4 py-2 text-[var(--fg-soft)] transition-colors duration-200 hover:border-[var(--stroke-strong)]"
            >
              back home
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ice)] opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--ice)]" />
              </span>
            </div>
            <div className="label-caps mt-4 text-[var(--fg-mute)]">signing you in</div>
            <p className="mt-2 text-[12.5px] leading-snug text-[var(--fg-soft)]">
              Linking your Spotify account to VibeSync…
            </p>
          </>
        )}
      </div>
    </main>
  );
}
