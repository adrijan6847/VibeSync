'use client';

import { AnimatePresence, motion } from 'framer-motion';

type NowPlayingTextProps = {
  title: string;
  artist: string;
  trackId: string | null;
};

/**
 * Title + artist lines. AnimatePresence keyed on trackId cross-fades
 * the whole block on swap, so title and artist never appear mismatched
 * mid-transition.
 */
export function NowPlayingText({ title, artist, trackId }: NowPlayingTextProps) {
  return (
    <div className="relative min-h-[56px] text-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={trackId ?? 'empty'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="flex flex-col items-center gap-0.5"
        >
          <div className="text-2xl font-semibold tracking-tight text-white">
            {title}
          </div>
          {artist ? (
            <div className="text-sm text-white/60">{artist}</div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
