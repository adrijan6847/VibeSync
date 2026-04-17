'use client';

import { motion } from 'framer-motion';
import type { Participant } from '@/lib/types';

/**
 * Arrange participants as small glowing dots orbiting the centerpiece.
 * Each is colored by their hue. You is highlighted.
 */
export function ParticipantRing({
  participants,
  youId,
  radius = 44,
  className,
}: {
  participants: Participant[];
  youId?: string;
  radius?: number;
  className?: string;
}) {
  if (participants.length === 0) return null;
  const angleStep = 360 / participants.length;

  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className ?? ''}`}
      aria-hidden
    >
      {participants.map((p, i) => {
        const angle = i * angleStep;
        const isYou = p.id === youId;
        return (
          <motion.div
            key={p.id}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}%)`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              delay: i * 0.05,
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div
              className="relative"
              style={{ transform: `rotate(${-angle}deg)` }}
            >
              <motion.div
                className="relative rounded-full"
                animate={{
                  scale: isYou ? [1, 1.18, 1] : [1, 1.08, 1],
                  opacity: [0.8, 1, 0.8],
                }}
                transition={{
                  duration: 2.4 + (i % 3) * 0.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{
                  width: isYou ? 14 : 10,
                  height: isYou ? 14 : 10,
                  background: `hsl(${p.hue}, 95%, 70%)`,
                  boxShadow: `0 0 14px hsl(${p.hue}, 95%, 68%), 0 0 28px hsl(${p.hue}, 95%, 55%)`,
                }}
              />
              {isYou && (
                <div className="absolute -inset-2 rounded-full border border-white/40" />
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
