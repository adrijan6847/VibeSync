'use client';

import { motion } from 'framer-motion';
import type { Phase } from '@/lib/types';

export function EnergyMeter({
  energy,
  phase,
}: {
  energy: number;
  phase: Phase;
}) {
  const pct = Math.max(0, Math.min(100, energy));

  const isHot = phase === 'peak' || phase === 'drop';

  return (
    <div className="flex w-full items-center gap-3">
      <div className="label-caps text-white/38">
        energy
      </div>
      <div className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-white/[0.05] ring-1 ring-inset ring-white/[0.04]">
        {/* Peak threshold tick at 88% — machined reference mark */}
        <div
          className="pointer-events-none absolute inset-y-[-3px] w-px bg-white/25"
          style={{ left: '88%' }}
        />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            // Steel → ice → cool-white. No hot colors.
            background:
              'linear-gradient(90deg, #6b8ba8 0%, #9ec9ff 55%, #dfeaf6 90%, #ffffff 100%)',
            boxShadow: isHot
              ? '0 0 14px rgba(188, 220, 255, 0.65), 0 0 28px rgba(158, 201, 255, 0.35)'
              : '0 0 8px rgba(158, 201, 255, 0.28)',
          }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        />
        {phase === 'peak' && (
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(232, 241, 252, 0.85), transparent)',
              mixBlendMode: 'screen',
            }}
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>
      <motion.div
        key={Math.round(pct / 10)}
        initial={{ scale: 0.9, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`mono text-[12px] font-medium tabular-nums tracking-[0.02em] ${
          isHot ? 'text-white' : 'text-white/70'
        }`}
        style={{
          minWidth: 24,
          textAlign: 'right',
          textShadow: isHot
            ? '0 0 10px rgba(188, 220, 255, 0.55)'
            : undefined,
        }}
      >
        {Math.round(pct)}
      </motion.div>
    </div>
  );
}
