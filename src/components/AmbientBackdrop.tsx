'use client';

import { motion } from 'framer-motion';

/**
 * Full-viewport ambient gradient field. Breathes slowly.
 * Sits at z-0 behind content.
 */
export function AmbientBackdrop({ intensity = 0.6 }: { intensity?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Layer 1: primary cold bloom — ice blue, heavily restrained */}
      <motion.div
        className="absolute -inset-[20%]"
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: `
            radial-gradient(44% 38% at 22% 26%, rgba(158, 201, 255, ${0.22 * intensity}) 0%, transparent 72%),
            radial-gradient(50% 44% at 78% 74%, rgba(120, 160, 200, ${0.18 * intensity}) 0%, transparent 72%),
            radial-gradient(54% 46% at 52% 52%, rgba(188, 220, 255, ${0.10 * intensity}) 0%, transparent 74%)
          `,
          filter: 'blur(72px)',
          willChange: 'opacity',
        }}
      />
      {/* Layer 2: slow atmospheric drift — steel silver */}
      <motion.div
        className="absolute -inset-[20%]"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 160, repeat: Infinity, ease: 'linear' }}
        style={{
          background: `
            radial-gradient(30% 26% at 30% 70%, rgba(200, 215, 230, ${0.08 * intensity}) 0%, transparent 68%),
            radial-gradient(26% 22% at 70% 30%, rgba(158, 201, 255, ${0.12 * intensity}) 0%, transparent 68%)
          `,
          filter: 'blur(96px)',
          willChange: 'transform',
        }}
      />
      {/* Vignette: carbon falloff */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(100% 80% at 50% 50%, transparent 42%, rgba(3, 4, 6, 0.82) 100%)',
        }}
      />
    </div>
  );
}
