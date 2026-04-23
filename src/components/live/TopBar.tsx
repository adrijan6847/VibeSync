'use client';

type TopBarProps = {
  code: string;
  liveCount: number;
  connected: boolean;
  isHost: boolean;
  onLeave: () => void;
  onOpenSearch: () => void;
};

/**
 * Three-slot top bar: leave (left), search glyph (center, host-only),
 * session code + live count (right). Stays pointer-events-auto so
 * overlays don't need to worry about z-index stacking for its controls.
 */
export function TopBar({
  code,
  liveCount,
  connected,
  isHost,
  onLeave,
  onOpenSearch,
}: TopBarProps) {
  return (
    <div className="pointer-events-none relative z-30 grid grid-cols-3 items-center gap-2 px-5 pt-5 sm:px-8 sm:pt-6">
      <div className="pointer-events-auto flex items-center">
        <button
          type="button"
          onClick={onLeave}
          className="mono flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 text-[10.5px] font-medium tracking-[0.14em] text-white/55 transition-[background,color] duration-180 hover:bg-white/10 hover:text-white/80"
        >
          <span className="text-[13px] leading-none">←</span>
          Leave
        </button>
      </div>
      <div className="flex items-center justify-center">
        {isHost ? (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search tracks"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-[background,color] duration-180 hover:bg-white/10 hover:text-white"
          >
            <SearchIcon />
          </button>
        ) : null}
      </div>
      <div className="pointer-events-auto flex items-center justify-end">
        <div className="mono flex items-center gap-2.5 text-[10.5px] font-medium tracking-[0.18em] text-white/55">
          <span className="relative flex h-1.5 w-1.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${connected ? 'animate-ping' : 'animate-pulse'} opacity-60`}
              style={{
                background: connected
                  ? 'rgba(188, 220, 255, 0.5)'
                  : 'rgba(200, 215, 230, 0.35)',
              }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{
                background: connected ? '#bcdcff' : 'rgba(200, 215, 230, 0.5)',
              }}
            />
          </span>
          <span className="uppercase">{code}</span>
          <span className="text-white/20">·</span>
          {connected ? (
            <span>{liveCount} live</span>
          ) : (
            <span className="text-white/65">connecting…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M10.8 10.8 L14 14" />
    </svg>
  );
}
