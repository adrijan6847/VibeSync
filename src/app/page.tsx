'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { getSocket } from '@/lib/socket';
import type { CreateResponse, JoinResponse } from '@/lib/types';

export default function LandingPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["room", "vibe", "drop", "pulse", "wave"] as const,
    []
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber((prev) => (prev + 1) % titles.length);
    }, 2800);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  async function ensureConnected() {
    const s = getSocket();
    if (!s.connected) s.connect();
    if (s.connected) return s;
    await new Promise<void>((resolve) => s.once('connect', () => resolve()));
    return s;
  }

  async function handleCreate() {
    if (busy) return;
    setBusy('create');
    setError(null);
    const s = await ensureConnected();
    s.emit('session:create', {}, (r: CreateResponse) => {
      router.push(`/s/${r.code}?host=1`);
    });
  }

  async function handleJoin(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const normalized = code.toUpperCase().trim();
    if (normalized.length < 4) {
      setError('Enter the 4-letter code');
      return;
    }
    setBusy('join');
    setError(null);
    const s = await ensureConnected();
    s.emit('session:join', { code: normalized }, (r: JoinResponse) => {
      if (r.ok) {
        router.push(`/s/${normalized}`);
      } else {
        setError(r.error || 'Could not join');
        setBusy(null);
      }
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <AmbientBackdrop intensity={0.6} />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="label-caps text-white/55">
              VibeSync
            </span>
          </div>
          <div className="label-caps flex items-center gap-2 text-white/35">
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: 'rgba(188, 220, 255, 0.5)' }}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#bcdcff]"
              />
            </span>
            live
          </div>
        </header>

        {/* Hero */}
        <section className="flex flex-1 items-center justify-center px-6 py-14 sm:px-10">
          <div className="flex w-full max-w-[960px] flex-col items-center text-center">
            <p
              className="label-caps anim-rise text-white/45"
              style={{ animationDelay: '0.08s' }}
            >
              one room · one frequency
            </p>

            <h1
              className="hero-title anim-rise mt-7 flex h-[2.2em] flex-col justify-center text-[clamp(52px,11.5vw,160px)] leading-none"
              style={{ animationDelay: '0.14s' }}
            >
              <span className="inline-block text-white">
                feel the
              </span>
              <span className="relative flex w-full justify-center overflow-hidden h-[1.15em] text-white/50">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={titleNumber}
                    className="absolute"
                    initial={{ y: '80%', opacity: 0, filter: 'blur(4px)' }}
                    animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
                    exit={{ y: '-80%', opacity: 0, filter: 'blur(4px)' }}
                    transition={{
                      y: { type: 'spring', stiffness: 60, damping: 18 },
                      opacity: { duration: 0.3 },
                      filter: { duration: 0.3 },
                    }}
                  >
                    <WordEffect word={titles[titleNumber]} />
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>

            <p
              className="anim-rise mt-8 max-w-[480px] text-[15px] leading-[1.7] text-white/55 sm:text-base"
              style={{ animationDelay: '0.28s' }}
            >
              Every device becomes part of one synchronized vibe. Tap together,
              build the energy, and trigger the drop — live, across every screen
              in the room.
            </p>

            <div
              className="anim-rise mt-14 flex w-full max-w-[480px] flex-col gap-4"
              style={{ animationDelay: '0.42s' }}
            >
              {/* Primary CTA */}
              <button
                onClick={handleCreate}
                disabled={!!busy}
                className="group relative w-full overflow-hidden rounded-2xl bg-white px-8 py-[18px] text-[14.5px] font-semibold tracking-[-0.01em] text-[#0a0a0a] transition-colors duration-200 hover:bg-[#f2f7fc] disabled:opacity-50"
              >
                <span className="relative z-10 flex items-center justify-center gap-2.5">
                  {busy === 'create' ? 'Opening room…' : 'Start a session'}
                  <Arrow />
                </span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <span className="label-caps text-white/30">
                  or join
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              {/* Join form */}
              <form
                onSubmit={handleJoin}
                className="panel panel-hover flex items-center gap-2 rounded-2xl p-2"
              >
                <input
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={4}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="4-LETTER CODE"
                  className="mono min-w-0 flex-1 bg-transparent px-4 py-3 text-center text-[18px] font-medium tracking-[0.25em] text-white outline-none placeholder:text-white/20 transition-colors duration-200 focus:placeholder:text-white/30"
                />
                <button
                  type="submit"
                  disabled={!!busy}
                  className="rounded-xl bg-white/10 px-5 py-3 text-[13px] font-medium tracking-[0.04em] text-white/90 transition-[background,color] duration-180 hover:bg-white/[0.16] hover:text-white disabled:opacity-40"
                >
                  {busy === 'join' ? '…' : 'Join'}
                </button>
              </form>

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="label-caps text-[#e8b4b4]/80"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Footer dots */}
        <footer className="flex items-center justify-between px-6 pb-6 sm:px-10 sm:pb-8">
          <Dot label="Realtime" />
          <Dot label="Multi-device" />
          <Dot label="Synced drop" />
        </footer>
      </div>
    </main>
  );
}

function WordEffect({ word }: { word: string }) {
  const display = `${word}.`;
  const chars = display.split('');

  if (word === 'vibe') {
    return (
      <motion.span
        className="inline-block"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.5) 28%, #9ec9ff 40%, #ffffff 50%, #bcdcff 60%, rgba(255,255,255,0.5) 72%, rgba(255,255,255,0.5) 100%)',
          backgroundSize: '300% 100%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}
        animate={{ backgroundPosition: ['120% 0%', '-20% 0%'] }}
        transition={{
          duration: 2.2,
          ease: [0.4, 0, 0.4, 1],
          repeat: Infinity,
          repeatDelay: 0.25,
        }}
      >
        {display}
      </motion.span>
    );
  }

  if (word === 'drop') {
    return (
      <span className="inline-block">
        {chars.map((ch, i) => {
          const dir = i % 2 === 0 ? 1 : -1;
          return (
            <motion.span
              key={i}
              className="inline-block"
              style={{ transformOrigin: '50% 100%' }}
              animate={{
                y: ['0em', '0.32em', '0.3em', '0em'],
                rotate: [0, dir * 5, dir * 3, 0],
                scaleY: [1, 0.88, 0.92, 1],
              }}
              transition={{
                duration: 2.2,
                times: [0, 0.4, 0.6, 1],
                ease: ['easeIn', 'easeOut', [0.22, 1, 0.36, 1]],
                delay: i * 0.1,
              }}
            >
              {ch}
            </motion.span>
          );
        })}
      </span>
    );
  }

  if (word === 'pulse') {
    return (
      <motion.span
        className="inline-block"
        animate={{ scale: [1, 1.09, 1, 1.14, 1] }}
        transition={{
          duration: 1.1,
          ease: 'easeInOut',
          times: [0, 0.12, 0.3, 0.42, 1],
          repeat: Infinity,
        }}
      >
        {display}
      </motion.span>
    );
  }

  if (word === 'wave') {
    return (
      <span className="inline-block">
        {chars.map((ch, i) => (
          <motion.span
            key={i}
            className="inline-block"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{
              duration: 1.7,
              ease: 'easeInOut',
              delay: i * 0.18,
            }}
          >
            {ch}
          </motion.span>
        ))}
      </span>
    );
  }

  return <span>{display}</span>;
}

function LogoMark() {
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="relative h-6 w-6"
    >
      {/* Machined aluminum ring: ice → silver → steel */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 210deg, #bcdcff, #e8eff7, #8a99a8, #1a1f26, #9ec9ff, #bcdcff)',
          filter: 'blur(2.5px)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-[3px] rounded-full bg-[var(--bg-deep)]" />
      <div
        className="absolute inset-[7px] rounded-full bg-white/95"
      />
    </motion.div>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path
        d="M3 7h7m0 0L7 4m3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function Dot({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-1.5 w-1.5">
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: 'rgba(188, 220, 255, 0.5)' }}
        />
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#bcdcff]"
        />
      </span>
      <span className="label-caps text-white/35">
        {label}
      </span>
    </div>
  );
}
