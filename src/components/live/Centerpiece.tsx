'use client';

import { motion } from 'framer-motion';
import type { Palette } from '@/lib/palette';
import { ParticipantRing } from '@/components/ParticipantRing';
import type { Participant } from '@/lib/types';
import type { CanonicalTrack, SyncClock } from '@/music/types';
import { Artwork } from './Artwork';
import { NowPlayingText } from './NowPlayingText';
import { ProgressBar } from './ProgressBar';
import { SyncIndicator } from './SyncIndicator';
import { TransportControls } from './TransportControls';

type CenterpieceProps = {
  participants: Participant[];
  youId?: string;
  nowPlaying: CanonicalTrack | null;
  palette: Palette | null;
  clock: SyncClock;
  positionMs: number;
  driftMs: number;
  queueLength: number;
  isHost: boolean;
  isLobby: boolean;
  /** Set when the current provider can't play nowPlaying. Renders a
   *  calm banner in place of the SYNCED indicator. */
  trackUnavailable: { message: string } | null;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (positionMs: number) => void;
};

/**
 * The centered ring-art-info stack. Layout:
 *
 *   ┌─ aspect-square container ─┐
 *   │      ┌ participants ┐     │
 *   │      │   ┌ art ┐    │     │
 *   │      │   │     │    │     │
 *   │      │   └─────┘    │     │
 *   │      └──────────────┘     │
 *   └───────────────────────────┘
 *             title
 *             artist
 *          ♪ SYNCED
 *           ─────●───
 *        ⇆ ⏮ ⏵ ⏭ ⇌
 *
 * Lobby mode: art → placeholder, info → "Waiting for host to pick a
 * track", progress/transport hidden. That way the layout doesn't shift
 * when the room goes live — only the centerpiece's inner content swaps.
 */
export function Centerpiece({
  participants,
  youId,
  nowPlaying,
  palette,
  clock,
  positionMs,
  driftMs,
  queueLength,
  isHost,
  isLobby,
  trackUnavailable,
  onPlay,
  onPause,
  onSeek,
}: CenterpieceProps) {
  const showTransport = !isLobby && !!nowPlaying;

  return (
    <motion.div
      className="relative z-10 flex w-full flex-col items-center gap-6 px-5 sm:px-8"
      animate={{ scale: isLobby ? 0.92 : 1, opacity: isLobby ? 0.95 : 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Ring + art */}
      <div className="relative aspect-square w-[min(86vw,86vh)] max-w-[520px]">
        <ParticipantRing participants={participants} youId={youId} radius={46} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Artwork
            url={isLobby ? null : nowPlaying?.artworkUrl ?? null}
            title={nowPlaying?.title ?? ''}
            palette={isLobby ? null : palette}
            className="w-[55%]"
          />
        </div>
      </div>

      {/* Title / sync / progress / transport */}
      <div className="flex w-full max-w-[480px] flex-col items-center gap-3">
        <NowPlayingText
          title={
            isLobby
              ? 'Waiting for host to pick a track'
              : nowPlaying?.title ?? 'Nothing playing'
          }
          artist={isLobby ? '' : nowPlaying?.artist ?? ''}
          trackId={isLobby ? 'lobby' : nowPlaying?.id ?? 'empty'}
        />

        {showTransport && trackUnavailable ? (
          <UnavailableBanner message={trackUnavailable.message} />
        ) : showTransport && !clock.paused ? (
          <SyncIndicator driftMs={driftMs} />
        ) : (
          <div className="h-[14px]" aria-hidden />
        )}

        {showTransport ? (
          <>
            <ProgressBar
              positionMs={positionMs}
              durationMs={nowPlaying.durationMs}
              isHost={isHost}
              palette={palette}
              onSeek={onSeek}
            />
            <TransportControls
              paused={clock.paused}
              isHost={isHost}
              queueLength={queueLength}
              onPlay={onPlay}
              onPause={onPause}
            />
          </>
        ) : null}
      </div>
    </motion.div>
  );
}

function UnavailableBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="mono max-w-[360px] rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-center text-[10.5px] font-medium tracking-[0.12em] text-white/65 backdrop-blur-xl"
    >
      {message}
    </div>
  );
}
