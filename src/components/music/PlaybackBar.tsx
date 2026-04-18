'use client';

import { useEffect, useRef, useState } from 'react';
import { derivePositionMs } from '@/music/sync/SyncClock';
import type { CanonicalTrack, SyncClock } from '@/music/types';

type Props = {
  nowPlaying: CanonicalTrack;
  clock: SyncClock;
  clockOffsetMs: number;
  isHost: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (positionMs: number) => void;
};

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Live-phase playback bar. Docks where the energy meter used to live.
 * Host gets transport controls + scrubbable timeline; guests see the
 * same surface in read-only mode and follow via the shared clock.
 */
export function PlaybackBar({
  nowPlaying,
  clock,
  clockOffsetMs,
  isHost,
  onPlay,
  onPause,
  onSeek,
}: Props) {
  const [position, setPosition] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const nowServer = Date.now() + clockOffsetMs;
      // startedAtWallClock in the future = server scheduled the play for
      // a grace window ahead, giving adapters time to warm up. Hold the
      // visible position steady so the timeline doesn't sprint past the
      // silent audio.
      const inGrace =
        !clock.paused && clock.startedAtWallClock > nowServer;
      setBuffering(inGrace);
      setPosition(derivePositionMs(clock, Date.now(), clockOffsetMs));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [clock, clockOffsetMs]);

  const duration = nowPlaying.durationMs;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <div className="pointer-events-auto panel rounded-2xl px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Artwork url={nowPlaying.artworkUrl} title={nowPlaying.title} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-[13px] font-medium tracking-[-0.005em] text-white">
            {nowPlaying.title}
          </div>
          <div className="truncate text-[11.5px] text-[var(--fg-soft)]">
            {nowPlaying.artist}
          </div>
        </div>

        {isHost && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Restart" onClick={() => onSeek(0)}>
              <SkipBackIcon />
            </IconButton>
            <PlayPauseButton
              paused={clock.paused}
              onPlay={onPlay}
              onPause={onPause}
            />
            <IconButton label="Next" disabled>
              <SkipForwardIcon />
            </IconButton>
          </div>
        )}

        <div className="mono tabular shrink-0 text-[10.5px] text-[var(--fg-mute)]">
          {buffering ? (
            <span className="text-[var(--fg-soft)]">starting…</span>
          ) : (
            <>
              {fmt(position)} / {fmt(duration)}
            </>
          )}
        </div>
      </div>

      <Timeline
        progress={progress}
        durationMs={duration}
        seekable={isHost}
        onScrub={onSeek}
      />
    </div>
  );
}

function Timeline({
  progress,
  durationMs,
  seekable,
  onScrub,
}: {
  progress: number;
  durationMs: number;
  seekable: boolean;
  onScrub: (positionMs: number) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekable || durationMs <= 0) return;
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onScrub(Math.floor(ratio * durationMs));
  };

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      role={seekable ? 'slider' : undefined}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={seekable ? 'Seek track' : undefined}
      className={`mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-white/10 ${
        seekable ? 'cursor-pointer' : ''
      }`}
    >
      <div
        className="h-full bg-[var(--ice)]"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

function PlayPauseButton({
  paused,
  onPlay,
  onPause,
}: {
  paused: boolean;
  onPlay: () => void;
  onPause: () => void;
}) {
  return (
    <button
      type="button"
      onClick={paused ? onPlay : onPause}
      aria-label={paused ? 'Play' : 'Pause'}
      className="mx-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0a0a0a] transition-colors duration-200 hover:bg-[#f2f7fc]"
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 transition-colors duration-180 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/75"
    >
      {children}
    </button>
  );
}

function Artwork({ url, title }: { url?: string; title: string }) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="h-11 w-11 shrink-0 rounded-lg border border-[var(--stroke)] bg-white/[0.03]"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-label={title}
      width={44}
      height={44}
      className="h-11 w-11 shrink-0 rounded-lg border border-[var(--stroke)] object-cover"
      loading="lazy"
    />
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 1.8 L10 6 L3 10.2 Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2.5" y="2" width="2.5" height="8" rx="0.5" />
      <rect x="7" y="2" width="2.5" height="8" rx="0.5" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M11.5 3 L5.5 7 L11.5 11 Z" />
      <rect x="3.5" y="3" width="1.3" height="8" rx="0.4" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M2.5 3 L8.5 7 L2.5 11 Z" />
      <rect x="9.2" y="3" width="1.3" height="8" rx="0.4" />
    </svg>
  );
}
