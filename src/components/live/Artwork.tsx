'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Palette } from '@/lib/palette';

type ArtworkProps = {
  url: string | null;
  title: string;
  palette: Palette | null;
  className?: string;
};

/**
 * Large haloed album art at the core of the live view. Behind the image,
 * a sibling blur layer glows with the palette's primary color; on track
 * change, AnimatePresence cross-fades the two <img>s so the halo retints
 * smoothly with the art.
 *
 * The blur radius is set once on the sibling — we don't animate
 * `filter: blur()` per-frame (cheap visually, catastrophic for paint).
 */
export function Artwork({ url, title, palette, className }: ArtworkProps) {
  const glow = palette?.primary ?? 'rgba(158, 201, 255, 0.55)';

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Palette glow — a blurred sibling the same size. Opacity is the
          only animatable property; blur stays fixed. */}
      <div
        aria-hidden
        className="absolute inset-[-8%] rounded-[28px]"
        style={{
          background: `radial-gradient(closest-side, ${glow}, transparent 72%)`,
          filter: 'blur(44px)',
          opacity: url ? 0.6 : 0.22,
          transition: 'opacity 400ms ease',
        }}
      />

      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
        <AnimatePresence mode="wait" initial={false}>
          {url ? (
            <motion.img
              key={url}
              src={url}
              alt=""
              aria-label={title}
              crossOrigin="anonymous"
              decoding="async"
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  'radial-gradient(circle at 50% 35%, rgba(255,255,255,0.04), rgba(0,0,0,0.0) 60%), linear-gradient(180deg, #0e1116 0%, #060809 100%)',
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
