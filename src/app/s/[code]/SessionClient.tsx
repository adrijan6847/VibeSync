'use client';

import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { DropOverlay } from '@/components/DropOverlay';
import { EnergyMeter } from '@/components/EnergyMeter';
import { Orb } from '@/components/Orb';
import { ParticipantRing } from '@/components/ParticipantRing';
import { QR } from '@/components/QR';
import { TapSurface } from '@/components/TapSurface';
import { tick, unlock } from '@/lib/sound';
import { useSession } from '@/lib/useSession';

type Props = { code: string };

export default function SessionClient({ code }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const isHostIntent = search.get('host') === '1';

  const session = useSession();
  const { connected, state, you, isHost, energy, phase, beatId, drop, clockOffset } = session;

  const [joinAttempted, setJoinAttempted] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Auto-join if we don't already have state for this code
  useEffect(() => {
    if (!connected || state?.code === code || joinAttempted) return;
    setJoinAttempted(true);
    session.join(code).then((r) => {
      if (!r.ok) setNotFound(true);
    });
  }, [connected, state, code, joinAttempted, session]);

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.delete('host');
    return url.toString();
  }, []);

  const handleTap = useCallback(() => {
    unlock();
    tick();
    session.tap();
  }, [session]);

  const handleStart = useCallback(() => {
    unlock();
    session.start();
  }, [session]);

  // Unlock audio on any first interaction
  useEffect(() => {
    const h = () => unlock();
    window.addEventListener('pointerdown', h, { once: true });
    window.addEventListener('keydown', h, { once: true });
    return () => {
      window.removeEventListener('pointerdown', h);
      window.removeEventListener('keydown', h);
    };
  }, []);

  // Drop fire — trigger any extra local fx
  const dropFireCountRef = useRef(0);
  const onDropFire = useCallback(() => {
    dropFireCountRef.current++;
    if (navigator.vibrate) navigator.vibrate([40, 30, 80, 30, 200]);
  }, []);

  if (notFound) {
    return (
      <main className="relative flex min-h-screen items-center justify-center">
        <AmbientBackdrop intensity={0.4} />
        <div className="relative z-10 text-center">
          <p className="label-caps text-white/45">
            session not found
          </p>
          <h1 className="hero-title mt-4 text-[clamp(36px,7vw,68px)] text-white/85">
            that room has closed
          </h1>
          <button
            onClick={() => router.push('/')}
            className="mono mt-8 rounded-xl border border-white/15 bg-white/8 px-6 py-3 text-[12px] font-medium tracking-[0.14em] text-white/85 transition-[background] duration-180 hover:bg-white/12"
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  const hue = you?.hue ?? 280;
  const participants = state?.participants ?? [];
  const isLobby = phase === 'lobby';

  return (
    <main className="relative h-[100svh] overflow-hidden">
      <AmbientBackdrop intensity={isLobby ? 0.6 : 0.95} />

      {/* Global beat-driven background pulse */}
      <BeatWash beatId={beatId} phase={phase} />

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="mono flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 text-[10.5px] font-medium tracking-[0.14em] text-white/50 transition-[background,color] duration-180 hover:bg-white/10 hover:text-white/70"
          >
            <span className="text-[13px] leading-none">←</span>
            Leave
          </button>
        </div>
        <div className="mono flex items-center gap-2.5 text-[10.5px] font-medium tracking-[0.18em] text-white/50">
          <span className="relative flex h-1.5 w-1.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${
                connected ? 'animate-ping' : ''
              } opacity-60`}
              style={{
                background: connected
                  ? 'rgba(188, 220, 255, 0.5)'
                  : 'rgba(255, 255, 255, 0.15)',
              }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{
                background: connected ? '#bcdcff' : 'rgba(255,255,255,0.3)',
              }}
            />
          </span>
          <span className="uppercase">{code}</span>
          <span className="text-white/20">·</span>
          <span>{participants.length} live</span>
        </div>
      </div>

      {/* Centerpiece */}
      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-center"
        animate={{
          scale: isLobby ? 0.62 : 1,
          opacity: isLobby ? 0.55 : 1,
        }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="relative aspect-square w-[min(86vw,86vh)] max-w-[720px]">
          <ParticipantRing
            participants={participants}
            youId={you?.id}
            radius={46}
          />
          <Orb energy={energy} phase={phase} beatId={beatId} />
        </div>
      </motion.div>

      {/* Tap surface — only in live phases */}
      {!isLobby && (
        <TapSurface
          enabled={phase !== 'drop'}
          hue={hue}
          onTap={handleTap}
        />
      )}

      {/* Lobby overlay */}
      {isLobby && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between pb-10 pt-20 transition-opacity duration-500 sm:pb-14 sm:pt-24"
        >
            {/* TOP: code + QR */}
            <div className="flex flex-col items-center">
              <p className="label-caps text-white/40">
                session code
              </p>
              <div
                className="mono anim-rise mt-3 text-[clamp(48px,9.5vw,100px)] font-light leading-none text-white"
                style={{
                  letterSpacing: '0.14em',
                  animationDelay: '0.05s',
                }}
              >
                {code}
              </div>

              {joinUrl && (
                <div className="pointer-events-auto anim-rise mt-6 flex items-center gap-4" style={{ animationDelay: '0.2s' }}>
                  <QR value={joinUrl} size={84} />
                  <div className="flex flex-col gap-2">
                    <span className="label-caps text-white/40">
                      scan to join
                    </span>
                    <span className="mono text-[11px] font-medium tracking-[0.12em] text-white/65">
                      {participants.length} in room
                    </span>
                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                      {participants.slice(0, 10).map((p) => (
                        <span
                          key={p.id}
                          className="block h-[5px] w-[5px] rounded-full"
                          style={{
                            background: `hsl(${p.hue}, 95%, 70%)`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* BOTTOM: CTA */}
            <div className="pointer-events-auto flex flex-col items-center gap-4">
              {isHost || isHostIntent ? (
                <motion.button
                  onClick={handleStart}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative overflow-hidden rounded-full border border-white/25 bg-white/95 px-10 py-[18px] text-[13px] font-semibold uppercase tracking-[0.18em] text-[#0a0a0a] shadow-[0_16px_48px_-16px_rgba(255,255,255,0.45)] transition-[background,box-shadow] duration-200 hover:bg-white hover:shadow-[0_20px_60px_-16px_rgba(255,255,255,0.55)]"
                >
                  Start the vibe
                </motion.button>
              ) : (
                <div className="mono flex items-center gap-2.5 rounded-full border border-white/12 bg-white/5 px-5 py-3 text-[10.5px] font-medium tracking-[0.18em] text-white/55">
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{
                      background: '#bcdcff',
                    }}
                  />
                  <span className="uppercase">waiting for host</span>
                </div>
              )}
              <p className="label-caps text-white/25">
                tap together · feel the drop
              </p>
            </div>
        </div>
      )}

      {/* Live HUD — phase label + energy */}
      {!isLobby && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pb-6 transition-opacity duration-500 sm:px-10 sm:pb-10">
            <div className="mx-auto flex max-w-[720px] flex-col gap-3">
              <div className="flex items-end justify-between">
                <PhaseLabel phase={phase} />
                <TapHint phase={phase} />
              </div>
              <EnergyMeter energy={energy} phase={phase} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {participants.slice(0, 12).map((p) => (
                    <motion.span
                      key={p.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                      className="block h-[5px] w-[5px] rounded-full"
                      style={{
                        background: `hsl(${p.hue}, 95%, 70%)`,
                        outline: p.id === you?.id ? '1px solid rgba(255,255,255,0.6)' : undefined,
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
                {isHost && (
                  <div className="pointer-events-auto">
                    <button
                      onClick={session.reset}
                      className="mono rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.18em] text-white/45 transition-[background,color] duration-180 hover:bg-white/10 hover:text-white/65"
                    >
                      reset
                    </button>
                  </div>
                )}
              </div>
            </div>
        </div>
      )}

      {/* Drop system (flash, shockwave, countdown, color wash) */}
      <DropOverlay
        phase={phase}
        drop={drop}
        clockOffset={clockOffset}
        onDropFire={onDropFire}
      />
    </main>
  );
}

function PhaseLabel({ phase }: { phase: string }) {
  const map: Record<string, { label: string; tone: string; glow?: string }> = {
    building: { label: 'build it up', tone: 'text-white/50' },
    peak: {
      label: 'almost there',
      tone: 'text-[#bcdcff]',
      glow: '0 0 18px rgba(188, 220, 255, 0.5)',
    },
    drop: {
      label: 'drop',
      tone: 'text-white',
      glow: '0 0 24px rgba(255, 255, 255, 0.85)',
    },
    afterglow: { label: 'afterglow', tone: 'text-[#cfe0ef]' },
  };
  const v = map[phase] ?? { label: phase, tone: 'text-white/55' };
  const isPeakish = phase === 'peak' || phase === 'drop';
  return (
    <motion.div
      key={phase}
      initial={{ opacity: 0, y: 6, letterSpacing: '0.4em' }}
      animate={{ opacity: 1, y: 0, letterSpacing: '0.22em' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="label-caps flex items-center gap-2"
    >
      <motion.span
        className={v.tone}
        animate={isPeakish ? { opacity: [0.7, 1, 0.7] } : undefined}
        transition={isPeakish ? { duration: 0.9, repeat: Infinity } : undefined}
        style={v.glow ? { textShadow: v.glow } : undefined}
      >
        {v.label}
      </motion.span>
    </motion.div>
  );
}

function TapHint({ phase }: { phase: string }) {
  if (phase === 'drop')
    return (
      <span className="label-caps text-white/60">
        hold on
      </span>
    );
  if (phase === 'afterglow')
    return (
      <span className="label-caps text-white/40">
        cooling down
      </span>
    );
  return (
    <motion.span
      animate={{ opacity: [0.45, 0.85, 0.45] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      className="label-caps text-white/50"
    >
      tap anywhere
    </motion.span>
  );
}

function BeatWash({ beatId, phase }: { beatId: number; phase: string }) {
  return (
    <motion.div
      key={`${phase}-${beatId}`}
      className="pointer-events-none fixed inset-0 z-[5]"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.0, 0.12, 0] }}
      transition={{ duration: phase === 'drop' ? 0.22 : 0.35, ease: 'easeOut' }}
      style={{
        background:
          'radial-gradient(60% 50% at 50% 50%, rgba(255,255,255,0.25), rgba(255,255,255,0) 70%)',
        mixBlendMode: 'screen',
      }}
    />
  );
}
