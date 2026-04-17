'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';

type Ripple = { id: number; x: number; y: number; hue: number };

type Props = {
  hue: number;
  enabled: boolean;
  onTap: () => void;
  children?: React.ReactNode;
};

export function TapSurface({ hue, enabled, onTap, children }: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!enabled) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = ++idRef.current;
      setRipples((rs) => [...rs, { id, x, y, hue }]);
      // Prune after animation
      setTimeout(() => {
        setRipples((rs) => rs.filter((r) => r.id !== id));
      }, 900);
      if (navigator.vibrate) navigator.vibrate(10);
      onTap();
    },
    [enabled, hue, onTap],
  );

  return (
    <button
      type="button"
      className="absolute inset-0 h-full w-full cursor-pointer select-none bg-transparent outline-none"
      onPointerDown={handlePointer}
      disabled={!enabled}
      aria-label="Tap to contribute energy"
    >
      {children}
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: r.x,
              top: r.y,
              background: `radial-gradient(circle, hsla(${r.hue},95%,70%,0.55) 0%, hsla(${r.hue},95%,70%,0) 70%)`,
              mixBlendMode: 'screen',
            }}
            initial={{
              width: 40,
              height: 40,
              x: -20,
              y: -20,
              opacity: 0.8,
            }}
            animate={{
              width: 340,
              height: 340,
              x: -170,
              y: -170,
              opacity: 0,
            }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </AnimatePresence>
    </button>
  );
}
