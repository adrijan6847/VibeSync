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

import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SuggestiveSearch } from './SuggestiveSearch';
import type { MusicActions, MusicSnapshot } from '@/music/useMusicSession';
import type { Participant } from '@/lib/types';

type Props = {
  music: MusicSnapshot & MusicActions;
  participants: Participant[];
  youId: string | undefined;
};

export function HostLobbyPanel({ music, participants, youId }: Props) {
  // Fallback safety net — /sync stashes a pending provider before
  // navigating, but if that flag was lost (private-mode sessionStorage,
  // manual refresh, etc.) kick off Spotify here so the host never sees
  // a blank panel.
  useEffect(() => {
    if (music.provider) return;
    music.selectProvider('spotify').catch(() => {
      // MusicPanel guests can still fall back to the picker by design;
      // for host we simply surface the error in the status line below.
    });
    // intentionally one-shot — any subsequent provider change is user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = music.provider !== null && music.adapterReady;

  return (
    <div className="panel flex flex-col gap-4 rounded-2xl px-4 py-4 backdrop-blur-xl">
      <GuestRoster participants={participants} youId={youId} />

      <div className="h-px w-full bg-[var(--stroke)]" />

      <AnimatePresence mode="wait">
        {ready ? (
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
              {music.adapterError ? 'connection lost — retry' : 'syncing your music…'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
