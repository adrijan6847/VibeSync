'use client';

/**
 * Host-only lobby panel. The host already linked Spotify + Apple at /sync,
 * so instead of the generic provider picker, we:
 *
 *   1. Finish the in-room handoff silently — selectProvider('spotify')
 *      if nothing is picked yet, using the token /sync already cached.
 *   2. Once the adapter is ready, show a list of everyone in the room
 *      and a search box the host uses to queue a track for everyone.
 *
 * Guests still arrive via QR and hit the regular MusicPanel picker;
 * this component is strictly the host path.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SuggestiveSearch } from './SuggestiveSearch';
import type { MusicActions, MusicSnapshot } from '@/music/useMusicSession';
import type { Participant } from '@/lib/types';
import {
  getAdapter,
  providerDisplayName,
  readAndClearPendingProvider,
} from '@/music/adapters';
import { startSpotifyLogin } from '@/music/adapters/spotify-auth';
import type { ProviderId } from '@/music/types';

type Props = {
  music: MusicSnapshot & MusicActions;
  participants: Participant[];
  youId: string | undefined;
};

export function HostLobbyPanel({ music, participants, youId }: Props) {
  // Provider handoff from /sync. Priority:
  //   1. pending-provider flag stashed right before navigation (covers
  //      "linked both, preferred one" and the OAuth-return hop)
  //   2. whichever adapter reports isAuthenticated() — supports the
  //      Apple-only or Spotify-only host who only signed into one side
  //   3. spotify as a last-resort nudge so the host still sees UI
  //      (ConnectUI / error state below) instead of a blank panel
  useEffect(() => {
    if (music.provider) return;
    const target = resolveHostProvider();
    music.selectProvider(target).catch(() => {
      // Error is surfaced through the adapterError branch below.
    });
    // intentionally one-shot — any subsequent provider change is user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = music.provider !== null && music.adapterReady;
  const hasError = Boolean(music.adapterError);

  return (
    <div className="panel flex flex-col gap-4 rounded-2xl px-4 py-4 backdrop-blur-xl">
      <GuestRoster participants={participants} youId={youId} />

      <div className="h-px w-full bg-[var(--stroke)]" />

      <AnimatePresence mode="wait">
        {hasError ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ProviderReconnect
              provider={music.provider}
              message={music.adapterError ?? ''}
              onReconnect={() => music.selectProvider(music.provider ?? resolveHostProvider())}
            />
          </motion.div>
        ) : ready ? (
          <motion.div
            key="search"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            <SuggestiveSearch
              onSearch={music.search}
              onPick={music.load}
              suggestions={[
                'search a track…',
                'try "Midnight City"',
                'an artist you love',
                'set the mood',
              ]}
            />
          </motion.div>
        ) : (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 px-1 py-2"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white/60" />
            </span>
            <span className="label-caps text-[var(--fg-mute)]">
              syncing your music…
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Provider-agnostic reconnect affordance. Spotify needs a full OAuth
 * redirect (startSpotifyLogin leaves the page); Apple re-authenticates
 * in place via MusicKit. `onReconnect` is an optional post-success hook
 * the caller uses to re-run selectProvider() on the in-place flow.
 */
export function ProviderReconnect({
  provider,
  message,
  onReconnect,
}: {
  provider: ProviderId | null;
  message: string;
  onReconnect?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const targetProvider = provider ?? resolveHostProvider();
  const label = providerDisplayName(targetProvider).toLowerCase();

  const reconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (targetProvider === 'spotify') {
        const returnTo =
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : '/';
        // Navigates away; setBusy(false) only matters if the redirect
        // never happens (e.g. startSpotifyLogin threw before redirect).
        await startSpotifyLogin(returnTo);
        return;
      }
      // Apple / any in-place auth: re-run authenticate() then let the
      // caller retrigger selectProvider() so adapterReady flips back on.
      await getAdapter(targetProvider).authenticate();
      await onReconnect?.();
    } catch {
      // swallow — adapterError stays visible so user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-1 py-1">
      <span className="text-[13px] text-white/85">{message}</span>
      <button
        type="button"
        onClick={reconnect}
        disabled={busy}
        className="label-caps self-start rounded-full border border-[var(--stroke-strong)] px-3 py-1.5 text-white/90 transition-colors duration-180 hover:bg-white/[0.06] disabled:opacity-60"
      >
        {busy ? 'reconnecting…' : `reconnect ${label}`}
      </button>
    </div>
  );
}

/**
 * Shared host provider resolver — checked both on first mount and when
 * the reconnect button fires without a known provider. Keeps the two
 * call sites in lockstep.
 */
function resolveHostProvider(): ProviderId {
  const pending = typeof window !== 'undefined' ? readAndClearPendingProvider() : null;
  if (pending) return pending;
  // Probe in priority order. Adapter factories are cheap; authenticate()
  // is deferred, so isAuthenticated() just checks cached-token state.
  const candidates: ProviderId[] = ['spotify', 'apple'];
  for (const id of candidates) {
    try {
      if (getAdapter(id).isAuthenticated()) return id;
    } catch {
      // adapter not registered — skip
    }
  }
  return 'spotify';
}

function GuestRoster({
  participants,
  youId,
}: {
  participants: Participant[];
  youId: string | undefined;
}) {
  const ordered = useMemo(
    () => [...participants].sort((a, b) => a.joinedAt - b.joinedAt),
    [participants],
  );

  if (ordered.length === 0) {
    return (
      <div className="flex items-center justify-between px-1">
        <span className="label-caps text-[var(--fg-mute)]">in the room</span>
        <span className="label-caps text-[var(--fg-weak)]">just you</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="label-caps text-[var(--fg-mute)]">in the room</span>
        <span className="mono text-[10.5px] font-medium tracking-[0.14em] text-[var(--fg-weak)]">
          {ordered.length} live
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {(() => {
          let guestIndex = 0;
          return ordered.map((p) => {
            const isYou = p.id === youId;
            if (!isYou) guestIndex += 1;
            return (
              <li key={p.id} className="flex items-center gap-2.5 px-1 py-1">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: `hsl(${p.hue}, 95%, 70%)` }}
                />
                <span className="text-[13px] text-white/85">
                  {isYou ? 'you' : `guest ${guestIndex}`}
                </span>
                {isYou && (
                  <span className="label-caps text-[var(--fg-weak)]">host</span>
                )}
              </li>
            );
          });
        })()}
      </ul>
    </div>
  );
}
