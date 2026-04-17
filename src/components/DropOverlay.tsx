'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { scheduleDrop, scheduleRiser } from '@/lib/sound';
import type { DropPayload, Phase } from '@/lib/types';

type Props = {
  phase: Phase;
  drop: DropPayload | null;
  clockOffset: number; // serverNow - clientNow
  onDropFire?: () => void;
};

/**
 * Synchronized drop experience:
 * - Shows "3 / 2 / 1" countdown timed off server dropAt.
 * - Fires a white flash + audio on the exact server-aligned moment.
 * - During 'drop' phase renders an intensified overlay; fades in 'afterglow'.
 */
export function DropOverlay({ phase, drop, clockOffset, onDropFire }: Props) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(0);
  const firedDropRef = useRef<string | null>(null);
  const riserScheduledRef = useRef<string | null>(null);

  // Countdown driver
  useEffect(() => {
    if (!drop) {
      setCountdown(null);
      return;
    }
    const clientDropAt = drop.dropAt - clockOffset;

    // Schedule riser audio once (aligned to dropAt)
    if (riserScheduledRef.current !== drop.dropId) {
      const msToDrop = clientDropAt - Date.now();
      if (msToDrop > 120) {
        scheduleRiser(Math.max(600, Math.min(msToDrop, 1800)));
      }
      riserScheduledRef.current = drop.dropId;
    }

    let raf = 0;
    const update = () => {
      const msLeft = clientDropAt - Date.now();
      if (msLeft <= 0) {
        setCountdown(0);
        if (firedDropRef.current !== drop.dropId) {
          firedDropRef.current = drop.dropId;
          setFlash((n) => n + 1);
          scheduleDrop(0);
          onDropFire?.();
        }
        return;
      }
      const n = Math.ceil(msLeft / 1000);
      setCountdown(n);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [drop, clockOffset, onDropFire]);

  // Reset firing state when phase returns to building
  useEffect(() => {
    if (phase === 'building' && !drop) {
      firedDropRef.current = null;
      riserScheduledRef.current = null;
    }
  }, [phase, drop]);

  const showCountdown = countdown !== null && countdown > 0 && phase !== 'drop' && phase !== 'afterglow';

  return (
    <>
      {/* Countdown numerals */}
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {showCountdown && (
            <motion.div
              key={countdown}
              initial={{ scale: 1.6, opacity: 0, filter: 'blur(24px)' }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              exit={{ scale: 0.7, opacity: 0, filter: 'blur(20px)' }}
              transition={{ duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }}
              className="hero-title text-[22vw] leading-none text-white/95"
              style={{
                textShadow:
                  '0 0 70px rgba(188, 220, 255, 0.55), 0 0 140px rgba(158, 201, 255, 0.35)',
              }}
            >
              {countdown}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* White flash */}
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={flash}
            className="pointer-events-none fixed inset-0 z-40 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.95, 0.6, 0] }}
            transition={{ duration: 0.85, times: [0, 0.2, 1], ease: 'easeOut' }}
            onAnimationComplete={() => setFlash(0)}
          />
        )}
      </AnimatePresence>

      {/* Shockwave ring */}
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={`ring-${flash}`}
            className="pointer-events-none fixed left-1/2 top-1/2 z-30 aspect-square rounded-full border-[3px] border-white"
            initial={{ width: 40, height: 40, x: -20, y: -20, opacity: 0.9 }}
            animate={{
              width: [40, 1800],
              height: [40, 1800],
              x: [-20, -900],
              y: [-20, -900],
              opacity: [0.95, 0],
              borderWidth: [3, 0.5],
            }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>

      {/* Drop-phase color wash — cold atmospheric bloom */}
      <AnimatePresence>
        {phase === 'drop' && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              background:
                'radial-gradient(circle at 50% 55%, rgba(188, 220, 255, 0.32), rgba(120, 160, 200, 0.18) 45%, rgba(3, 4, 6, 0) 75%)',
              mixBlendMode: 'screen',
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
