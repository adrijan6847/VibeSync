'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { CanonicalTrack } from '@/music/types';

type Props = {
  onSearch: (query: string, limit?: number) => Promise<CanonicalTrack[]>;
  onPick: (track: CanonicalTrack) => void;
};

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

/**
 * Floating search dock for the live phase. Collapsed: a circular icon
 * button that the host can tap to swap tracks mid-session without
 * leaving the room. Expanded: pill input + dropdown of results.
 *
 * Reuses the same provider-agnostic `music.search` + `music.load` path
 * as the lobby picker — the server receives music:load and resets the
 * clock to paused/0 so the host can press play when ready.
 */
export function HostSearchDock({ onSearch, onPick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CanonicalTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!expanded) {
      setQuery('');
      setResults([]);
      setLoading(false);
      return;
    }
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await onSearch(q, 6);
        if (reqIdRef.current !== myReq) return;
        setResults(r);
      } catch {
        if (reqIdRef.current === myReq) setResults([]);
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, expanded, onSearch]);

  const handlePick = (t: CanonicalTrack) => {
    onPick(t);
    setExpanded(false);
  };

  const showNoMatches =
    expanded &&
    query.trim().length >= MIN_QUERY &&
    !loading &&
    results.length === 0;

  return (
    <div className="pointer-events-auto relative">
      <AnimatePresence mode="wait" initial={false}>
        {!expanded ? (
          <motion.button
            key="icon"
            type="button"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            onClick={() => setExpanded(true)}
            aria-label="Change track"
            className="panel flex h-10 w-10 items-center justify-center rounded-full text-[var(--fg-soft)] backdrop-blur-xl transition-colors duration-180 hover:bg-white/[0.06] hover:text-white"
          >
            <SearchIcon />
          </motion.button>
        ) : (
          <motion.div
            key="input"
            initial={{ width: 40, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="panel flex h-10 w-full items-center gap-2 overflow-hidden rounded-full pl-3 pr-1 backdrop-blur-xl">
              <span className="text-[var(--fg-mute)]">
                <SearchIcon />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search a track…"
                autoFocus
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setExpanded(false);
                }}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium tracking-[-0.005em] text-white outline-none placeholder:text-[var(--fg-mute)]"
              />
              {loading && (
                <span
                  aria-live="polite"
                  className="label-caps mr-1 text-[var(--fg-mute)]"
                >
                  …
                </span>
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close search"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--fg-mute)] transition-colors duration-180 hover:bg-white/[0.06] hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>

            <AnimatePresence>
              {(results.length > 0 || showNoMatches) && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="panel flex max-h-[300px] w-full flex-col overflow-y-auto rounded-2xl p-2 backdrop-blur-xl"
                >
                  {showNoMatches ? (
                    <div className="label-caps px-2 py-3 text-[var(--fg-mute)]">
                      no matches
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {results.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => handlePick(t)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-180 hover:bg-white/[0.05]"
                          >
                            <Artwork url={t.artworkUrl} title={t.title} />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-[13px] font-medium tracking-[-0.005em] text-white">
                                {t.title}
                              </span>
                              <span className="truncate text-[11.5px] text-[var(--fg-soft)]">
                                {t.artist}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
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

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 3 L9 9 M9 3 L3 9" />
    </svg>
  );
}

function Artwork({ url, title }: { url?: string; title: string }) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="h-9 w-9 shrink-0 rounded-md border border-[var(--stroke)] bg-white/[0.03]"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-label={title}
      width={36}
      height={36}
      className="h-9 w-9 shrink-0 rounded-md border border-[var(--stroke)] object-cover"
      loading="lazy"
    />
  );
}
