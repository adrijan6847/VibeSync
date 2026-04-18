'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CanonicalTrack } from '@/music/types';

type Props = {
  onSearch: (query: string, limit?: number) => Promise<CanonicalTrack[]>;
  onPick: (track: CanonicalTrack) => void;
  /** Shown above the results list. Kept provider-agnostic. */
  hint?: string;
};

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

export function TrackSearch({ onSearch, onPick, hint }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CanonicalTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search. A reqId ref makes sure a slower response from an
  // earlier query can't overwrite a newer result set.
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    const t = window.setTimeout(async () => {
      try {
        const r = await onSearch(q, 8);
        if (reqIdRef.current !== myReq) return;
        setResults(r);
      } catch (err) {
        if (reqIdRef.current !== myReq) return;
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, onSearch]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={hint ?? 'Search a track…'}
          autoFocus
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--stroke)] bg-white/[0.02] px-4 py-3 text-[14px] font-medium tracking-[-0.005em] text-white outline-none transition-colors duration-180 placeholder:text-[var(--fg-mute)] focus:border-[var(--stroke-strong)] focus:bg-white/[0.035]"
        />
        {loading && (
          <span
            className="label-caps absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-mute)]"
            aria-live="polite"
          >
            searching
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="label-caps text-[#e8b4b4]/80"
          >
            {error.length > 80 ? 'search failed' : error}
          </motion.div>
        )}
      </AnimatePresence>

      {query.trim().length >= MIN_QUERY && !loading && results.length === 0 && !error && (
        <div className="label-caps text-[var(--fg-mute)]">no matches</div>
      )}

      <ul className="flex max-h-[260px] flex-col gap-1 overflow-y-auto">
        {results.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t)}
              className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors duration-180 hover:border-[var(--stroke-strong)] hover:bg-white/[0.03]"
            >
              <Artwork url={t.artworkUrl} title={t.title} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-medium tracking-[-0.005em] text-white">
                  {t.title}
                </span>
                <span className="truncate text-[11.5px] text-[var(--fg-soft)]">
                  {t.artist}
                  {t.album ? ` · ${t.album}` : ''}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Artwork({ url, title }: { url?: string; title: string }) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="h-10 w-10 shrink-0 rounded-md border border-[var(--stroke)] bg-white/[0.03]"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-label={title}
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-md border border-[var(--stroke)] object-cover"
      loading="lazy"
    />
  );
}
