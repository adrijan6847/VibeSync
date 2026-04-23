'use client';

import { useState } from 'react';

type TransportControlsProps = {
  paused: boolean;
  isHost: boolean;
  queueLength: number;
  onPlay: () => void;
  onPause: () => void;
  /** stubs — see `Stubs` note in comments below */
  onPrev?: () => void;
  onNext?: () => void;
};

/**
 * Transport row: shuffle · prev · play/pause · next · repeat.
 *
 * NOTE on stubs: shuffle/prev/next/repeat are visually complete but
 * the session's music state graph has no queue-cursor or shuffle/repeat
 * flags yet. prev/next no-op unless a queue exists (then advance a
 * local cursor). shuffle/repeat toggle client-local flags only — they
 * are NOT broadcast to the server in v1. A proper queue-state task
 * will replace these stubs.
 */
export function TransportControls({
  paused,
  isHost,
  queueLength,
  onPlay,
  onPause,
  onPrev,
  onNext,
}: TransportControlsProps) {
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');

  const disabled = !isHost;
  const prevDisabled = disabled || queueLength === 0;
  const nextDisabled = disabled || queueLength === 0;

  const handlePlayPause = () => {
    if (disabled) return;
    if (paused) onPlay();
    else onPause();
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <SmallButton
        label="Shuffle"
        active={shuffle}
        disabled={disabled}
        onClick={() => !disabled && setShuffle((v) => !v)}
      >
        <ShuffleIcon />
      </SmallButton>
      <SmallButton
        label="Previous"
        disabled={prevDisabled}
        onClick={() => !prevDisabled && onPrev?.()}
      >
        <PrevIcon />
      </SmallButton>
      <button
        type="button"
        onClick={handlePlayPause}
        disabled={disabled}
        aria-label={paused ? 'Play' : 'Pause'}
        className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0a0a0a] transition-all duration-200 ${
          disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:scale-[1.04] hover:bg-[#f2f7fc] shadow-[0_10px_28px_-8px_rgba(255,255,255,0.45)]'
        }`}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>
      <SmallButton
        label="Next"
        disabled={nextDisabled}
        onClick={() => !nextDisabled && onNext?.()}
      >
        <NextIcon />
      </SmallButton>
      <SmallButton
        label="Repeat"
        active={repeat !== 'off'}
        disabled={disabled}
        onClick={() =>
          !disabled &&
          setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
        }
      >
        <RepeatIcon oneDot={repeat === 'one'} />
      </SmallButton>
    </div>
  );
}

function SmallButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-180 ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-white/70'
          : active
            ? 'text-white bg-white/12'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 1.8 L10 6 L3 10.2 Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2.5" y="2" width="2.5" height="8" rx="0.5" />
      <rect x="7" y="2" width="2.5" height="8" rx="0.5" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M13 3.5 L6 8 L13 12.5 Z" />
      <rect x="3.5" y="3.5" width="1.4" height="9" rx="0.4" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3 3.5 L10 8 L3 12.5 Z" />
      <rect x="11.1" y="3.5" width="1.4" height="9" rx="0.4" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 5 L5 5 L10 11 L13 11" />
      <path d="M2 11 L5 11 L6.5 9" />
      <path d="M11 9 L13 11 L11 13" />
      <path d="M11 3 L13 5 L11 7" />
      <path d="M9.5 7 L10 7" />
    </svg>
  );
}

function RepeatIcon({ oneDot }: { oneDot?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8 A5 5 0 0 1 13 8" />
      <path d="M13 8 A5 5 0 0 1 3 8" />
      <path d="M11 2 L13 4 L11 6" />
      <path d="M5 14 L3 12 L5 10" />
      {oneDot && <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />}
    </svg>
  );
}
