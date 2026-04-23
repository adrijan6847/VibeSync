'use client';

import { useEffect, useRef, useState } from 'react';
import type { Palette } from '@/lib/palette';

type ProgressBarProps = {
  positionMs: number;
  durationMs: number;
  isHost: boolean;
  palette: Palette | null;
  onSeek: (positionMs: number) => void;
};

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Scrubbable progress bar. Host can drag the playhead; guests see a
 * read-only bar. During a drag the incoming `positionMs` is ignored —
 * the thumb follows the pointer — and the seek fires on release.
 *
 * Split into its own component so the parent's positionMs stream
 * doesn't re-render the surrounding UI.
 */
export function ProgressBar({
  positionMs,
  durationMs,
  isHost,
  palette,
  onSeek,
}: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragMs, setDragMs] = useState(0);

  const progress =
    durationMs > 0
      ? Math.max(0, Math.min(1, (dragging ? dragMs : positionMs) / durationMs))
      : 0;

  const fillFrom = palette?.primary ?? '#bcdcff';
  const fillTo = palette?.accent ?? '#ffffff';

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setDragMs(ratio * durationMs);
    };
    const onUp = (e: PointerEvent) => {
      const rect = barRef.current?.getBoundingClientRect();
      setDragging(false);
      if (rect) {
        const ratio = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        onSeek(Math.floor(ratio * durationMs));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, durationMs, onSeek]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isHost || durationMs <= 0) return;
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragMs(ratio * durationMs);
    setDragging(true);
  };

  const displayMs = dragging ? dragMs : positionMs;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        role={isHost ? 'slider' : undefined}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={isHost ? 'Seek track' : undefined}
        className={`group relative h-[4px] w-full rounded-full bg-white/10 ${
          isHost ? 'cursor-pointer' : ''
        }`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${fillFrom}, ${fillTo})`,
          }}
        />
        {isHost && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            style={{ left: `${progress * 100}%` }}
          />
        )}
      </div>
      <div className="mono tabular flex items-center justify-between text-[11px] text-white/60">
        <span>{fmt(displayMs)}</span>
        <span>{fmt(durationMs)}</span>
      </div>
    </div>
  );
}
