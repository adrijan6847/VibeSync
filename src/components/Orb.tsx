'use client';

import { motion, useAnimationControls } from 'framer-motion';
import { useEffect } from 'react';
import type { Phase } from '@/lib/types';

type OrbProps = {
  energy: number; // 0..100
  phase: Phase;
  beatId: number;
  className?: string;
};

/**
 * The centerpiece. A large, breathing, reactive orb.
 * Layered gradients + animated displacement filter give organic motion.
 * Scales with energy and pulses on each beat.
 */
export function Orb({ energy, phase, beatId, className }: OrbProps) {
  const e = Math.max(0, Math.min(100, energy)) / 100;
  const baseScale = 0.86 + e * 0.1;
  const pulseCtrl = useAnimationControls();

  useEffect(() => {
    if (beatId === 0) return;
    const punch = phase === 'drop' ? 0.18 : phase === 'peak' ? 0.1 : 0.05;
    pulseCtrl.start({
      scale: [1, 1 + punch, 1],
      transition: {
        duration: phase === 'drop' ? 0.28 : 0.5,
        ease: [0.2, 0.8, 0.2, 1],
      },
    });
  }, [beatId, phase, pulseCtrl]);

  const displacement = 10 + e * 28 + (phase === 'drop' ? 34 : 0);

  return (
    <div
      className={`pointer-events-none relative aspect-square w-full ${className ?? ''}`}
    >
      {/* Outer cold bloom — ice blue, restrained */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgba(158, 201, 255, 0.38), rgba(158, 201, 255, 0) 72%)',
          filter: `blur(${44 + e * 28}px)`,
          opacity: 0.4 + e * 0.5,
          mixBlendMode: 'screen',
        }}
        animate={{ scale: phase === 'drop' ? [1, 1.32, 1.2] : 1 + e * 0.1 }}
        transition={{ duration: phase === 'drop' ? 0.8 : 1.2, ease: 'easeOut' }}
      />

      {/* Mid structural halo — cool silver/steel */}
      <motion.div
        className="absolute inset-[6%] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgba(214, 228, 244, 0.32), rgba(188, 220, 255, 0) 74%)',
          filter: `blur(${22 + e * 18}px)`,
          opacity: 0.5 + e * 0.38,
          mixBlendMode: 'screen',
        }}
        animate={{ scale: 1 + e * 0.08 }}
        transition={{ duration: 0.8 }}
      />

      {/* Core: energy-scaled wrapper × beat-punch wrapper */}
      <motion.div
        className="absolute inset-[14%] flex items-center justify-center"
        animate={{ scale: baseScale }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <motion.div
          animate={pulseCtrl}
          className="flex h-full w-full items-center justify-center"
        >
          <svg viewBox="0 0 400 400" className="h-full w-full">
            <defs>
              {/* Cool-white to ice-blue to carbon — precision optical bloom */}
              <radialGradient id="coreGrad" cx="50%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="14%" stopColor="#f2f7fc" stopOpacity="0.9" />
                <stop offset="36%" stopColor="#bcdcff" stopOpacity="0.72" />
                <stop offset="64%" stopColor="#6c8aa8" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#121822" stopOpacity="0" />
              </radialGradient>
              {/* Rim: thin ice rim fading to steel — no chromatic spread */}
              <radialGradient id="rimGrad" cx="50%" cy="55%" r="52%">
                <stop offset="58%" stopColor="#9ec9ff" stopOpacity="0" />
                <stop offset="90%" stopColor="#9ec9ff" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#cfe0ef" stopOpacity="0.35" />
              </radialGradient>

              <filter id="warp" x="-25%" y="-25%" width="150%" height="150%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.012"
                  numOctaves="2"
                  seed="7"
                >
                  <animate
                    attributeName="baseFrequency"
                    values="0.009 0.014; 0.015 0.010; 0.009 0.014"
                    dur={phase === 'drop' ? '1.8s' : '9s'}
                    repeatCount="indefinite"
                  />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" scale={displacement} />
              </filter>

              <filter id="bloom">
                <feGaussianBlur stdDeviation="8" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Warped rim */}
            <circle
              cx="200"
              cy="200"
              r="160"
              fill="url(#rimGrad)"
              filter="url(#warp)"
              opacity={0.7 + e * 0.3}
            />

            {/* Warped body */}
            <circle
              cx="200"
              cy="200"
              r="140"
              fill="url(#coreGrad)"
              filter="url(#warp)"
              style={{ mixBlendMode: 'screen' }}
            />

            {/* Pure bright core */}
            <circle
              cx="200"
              cy="195"
              r={54 + e * 22}
              fill="url(#coreGrad)"
              opacity={0.92}
              filter="url(#bloom)"
            />
          </svg>
        </motion.div>
      </motion.div>

      {/* Orbital rings (emerge as energy rises) */}
      <RingOrbit e={e} phase={phase} />
    </div>
  );
}

function RingOrbit({ e, phase }: { e: number; phase: Phase }) {
  const active = e > 0.3 || phase === 'drop' || phase === 'peak' || phase === 'afterglow';
  if (!active) return null;

  return (
    <div className="absolute inset-0">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border"
          style={{
            borderColor: 'rgba(200, 220, 240, 0.16)',
            boxShadow: '0 0 36px rgba(158, 201, 255, 0.18) inset',
            willChange: 'transform, opacity',
          }}
          animate={{
            scale: [1 + i * 0.04, 1.22 + i * 0.05, 1 + i * 0.04],
            opacity: [0.14 + e * 0.26, 0.32 + e * 0.42, 0.14 + e * 0.26],
          }}
          transition={{
            duration: phase === 'drop' ? 0.9 : 2.4 + i * 0.3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.18,
          }}
        />
      ))}
    </div>
  );
}
