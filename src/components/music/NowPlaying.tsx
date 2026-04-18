'use client';

import { useEffect, useState } from 'react';
import type { CanonicalTrack } from '@/music/types';
import { TrackSearch } from './TrackSearch';

type Props = {
  nowPlaying: CanonicalTrack | null;
  isHost: boolean;
  onLoad: (track: CanonicalTrack) => void;
  onSearch: (query: string, limit?: number) => Promise<CanonicalTrack[]>;
};

/**
 * Lobby-only track selector. Host searches + picks; guests see a
 * read-only preview. Once the session goes live, playback transport
 * moves to PlaybackBar at the bottom of the HUD.
 */
export function NowPlaying({ nowPlaying, isHost, onLoad, onSearch }: Props) {
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (nowPlaying) setPicking(false);
  }, [nowPlaying?.id]);

  if (!nowPlaying || picking) {
    return (
      <div className="panel rounded-2xl p-5">
        {isHost ? (
          <div className="flex flex-col gap-3">
            {nowPlaying && picking && (
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="label-caps self-start text-[var(--fg-mute)] transition-colors duration-180 hover:text-[var(--fg-soft)]"
              >
                ← back to selection
              </button>
            )}
            <TrackSearch onSearch={onSearch} onPick={onLoad} />
          </div>
        ) : (
          <div className="label-caps text-[var(--fg-mute)]">
            waiting for host to pick a track
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <Artwork url={nowPlaying.artworkUrl} title={nowPlaying.title} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-[14px] font-medium tracking-[-0.01em] text-white">
            {nowPlaying.title}
          </div>
          <div className="truncate text-[12px] text-[var(--fg-soft)]">
            {nowPlaying.artist}
          </div>
        </div>
        {isHost && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="label-caps shrink-0 rounded-lg border border-[var(--stroke)] px-2.5 py-1.5 text-[var(--fg-mute)] transition-colors duration-180 hover:border-[var(--stroke-strong)] hover:text-[var(--fg-soft)]"
            title="Pick another track"
          >
            change
          </button>
        )}
      </div>
    </div>
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
