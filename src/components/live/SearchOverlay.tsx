'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { HostSearchDock } from '@/components/music/HostSearchDock';
import type { CanonicalTrack } from '@/music/types';

type SearchOverlayProps = {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string, limit?: number) => Promise<CanonicalTrack[]>;
  onPick: (track: CanonicalTrack) => void;
};

/**
 * Full-screen overlay that reboxes HostSearchDock. Escape, backdrop
 * click, and a successful pick all close it.
 *
 * Opening the overlay doesn't affect playback — the socket events from
 * the underlying dock remain the same.
 */
export function SearchOverlay({
  open,
  onClose,
  onSearch,
  onPick,
}: SearchOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handlePick = (track: CanonicalTrack) => {
    onPick(track);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="search-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative mx-auto mt-[18vh] flex w-[min(92vw,460px)] flex-col items-center"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="mono mb-4 self-end flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 text-[10.5px] font-medium tracking-[0.14em] text-white/60 transition-colors duration-180 hover:bg-white/10 hover:text-white/85"
            >
              Esc
            </button>
            <HostSearchDock onSearch={onSearch} onPick={handlePick} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
