'use client';

import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { DropOverlay } from '@/components/DropOverlay';
import { BottomDock } from '@/components/live/BottomDock';
import { Centerpiece } from '@/components/live/Centerpiece';
import { SearchOverlay } from '@/components/live/SearchOverlay';
import { TopBar } from '@/components/live/TopBar';
import { HostLobbyPanel, ProviderReconnect } from '@/components/music/HostLobbyPanel';
import { MusicPanel } from '@/components/music/MusicPanel';
import { QR } from '@/components/QR';
import { TapSurface } from '@/components/TapSurface';
import { tick, unlock } from '@/lib/sound';
import { useSession } from '@/lib/useSession';
import { providerDisplayName } from '@/music/adapters';
import type { ProviderId } from '@/music/types';
import type { Participant } from '@/lib/types';

type Props = { code: string };

export default function SessionClient({ code }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const isHostIntent = search.get('host') === '1';
  // Set by the home page on a successful pre-navigation join. Tells us the
  // server already has this socket in the room, so the auto-join effect
  // below should skip instead of firing a duplicate session:join.
  const alreadyJoined = search.get('j') === '1';

  const session = useSession();
  const { connected, state, you, isHost, energy, phase, beatId, drop, clockOffset, music } = session;
  const hostControl = isHost || isHostIntent;

  const [notFound, setNotFound] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Ref (not state) so a StrictMode double-mount or a render-triggered effect
  // re-run can't fire a second join while the first is still in flight.
  const joinAttemptedRef = useRef(alreadyJoined);

  // Strip ?j=1 from the URL after reading it so a page refresh still
  // triggers the auto-join fallback below.
  useEffect(() => {
    if (!alreadyJoined) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('j');
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    );
  }, [alreadyJoined]);

  // Auto-join if we don't already have state for this code
  useEffect(() => {
    if (!connected || state?.code === code || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true;
    session.join(code).then((r) => {
      if (!r.ok) setNotFound(true);
    });
  }, [connected, state, code, session]);

  // Compute in an effect (not useMemo) so server render and the client's
  // first render both see `''` — the QR block mounts only after hydration,
  // avoiding a server/client HTML mismatch.
  const [joinUrl, setJoinUrl] = useState('');
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('host');
    url.searchParams.delete('j');
    setJoinUrl(url.toString());
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

  // Spacebar shortcut: start (host, lobby) / tap (live, non-drop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (phase === 'lobby') {
        if (isHost || isHostIntent) {
          e.preventDefault();
          handleStart();
        }
        return;
      }
      if (phase !== 'drop') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, isHost, isHostIntent, handleStart, handleTap]);

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

      <TopBar
        code={code}
        liveCount={participants.length}
        connected={connected}
        // Only live-phase hosts see the search glyph — there's no point
        // mid-session searching when the session hasn't started.
        isHost={!isLobby && hostControl && music.adapterReady && !music.adapterError}
        onLeave={() => router.push('/')}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {/* Centerpiece (shared between lobby + live; isLobby gates its
          inner content + transport). Lobby scales it down as a
          background element so the session-code / QR / start UI sit
          in front without relayout. */}
      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-center"
        animate={{
          scale: isLobby ? 0.62 : 1,
          opacity: isLobby ? 0.55 : 1,
        }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <Centerpiece
          participants={participants}
          youId={you?.id}
          nowPlaying={music.nowPlaying}
          palette={music.palette}
          clock={music.clock}
          positionMs={music.positionMs}
          driftMs={music.driftMs}
          queueLength={music.queue.length}
          isHost={hostControl}
          isLobby={isLobby}
          trackUnavailable={music.trackUnavailable}
          onPlay={music.play}
          onPause={music.pause}
          onSeek={music.seek}
        />
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
                          title={p.provider ? providerDisplayName(p.provider) : 'picking…'}
                          className="block h-[5px] w-[5px] rounded-full"
                          style={{
                            background: `hsl(${p.hue}, 95%, 70%)`,
                          }}
                        />
                      ))}
                    </div>
                    <ProviderLegend participants={participants} />
                  </div>
                </div>
              )}
            </div>

            {/* MIDDLE: music setup — host gets guest roster + search (already
                linked at /sync); guests still see the picker here. */}
            <div className="pointer-events-auto w-full max-w-[420px] px-4 sm:px-0">
              {hostControl ? (
                <HostLobbyPanel
                  music={music}
                  participants={participants}
                  youId={you?.id}
                />
              ) : (
                <MusicPanel music={music} isHost={hostControl} />
              )}
            </div>

            {/* BOTTOM: CTA */}
            <div className="pointer-events-auto flex flex-col items-center gap-4">
              {isHost || isHostIntent ? (
                <motion.button
                  onClick={handleStart}
                  whileHover={music.adapterError ? undefined : { scale: 1.02 }}
                  whileTap={music.adapterError ? undefined : { scale: 0.97 }}
                  disabled={Boolean(music.adapterError)}
                  className="relative overflow-hidden rounded-full border border-white/25 bg-white/95 px-10 py-[18px] text-[13px] font-semibold uppercase tracking-[0.18em] text-[#0a0a0a] shadow-[0_16px_48px_-16px_rgba(255,255,255,0.45)] transition-[background,box-shadow] duration-200 hover:bg-white hover:shadow-[0_20px_60px_-16px_rgba(255,255,255,0.55)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
              {(isHost || isHostIntent) && music.adapterError ? (
                <p
                  role="alert"
                  className="label-caps max-w-[320px] text-center text-[#e8b4b4]/80"
                >
                  {music.adapterError}
                </p>
              ) : (
                <p className="label-caps text-white/25">
                  tap together · feel the drop
                </p>
              )}
            </div>
        </div>
      )}

      {/* Host-side adapter status (live phase). Search is reached via
          the top-bar glyph now, so this panel is only here for the
          error + loading states. */}
      {!isLobby && hostControl && (music.adapterError || !music.adapterReady) && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-30 -translate-x-1/2 sm:top-20">
          {music.adapterError ? (
            <div className="panel w-[min(92vw,360px)] rounded-2xl p-3 backdrop-blur-xl">
              <ProviderReconnect
                provider={music.provider}
                message={music.adapterError}
                onReconnect={() =>
                  music.provider
                    ? music.selectProvider(music.provider)
                    : undefined
                }
              />
            </div>
          ) : (
            <div
              role="status"
              className="panel flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur-xl"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white/60" />
              </span>
              <span className="label-caps text-[var(--fg-mute)]">
                syncing music…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bottom dock — persistent live-phase secondary views. */}
      {!isLobby && (
        <BottomDock
          queue={music.queue}
          participants={participants}
          youId={you?.id}
        />
      )}

      {/* Search overlay — host-only, reboxed HostSearchDock. */}
      <SearchOverlay
        open={searchOpen && hostControl && music.adapterReady && !music.adapterError}
        onClose={() => setSearchOpen(false)}
        onSearch={music.search}
        onPick={music.load}
      />

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

function ProviderLegend({
  participants,
}: {
  participants: Participant[];
}) {
  const counts = new Map<ProviderId, number>();
  for (const p of participants) {
    if (!p.provider) continue;
    counts.set(p.provider, (counts.get(p.provider) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const entries = Array.from(counts.entries());
  return (
    <span className="mono mt-1.5 block text-[9.5px] font-medium tracking-[0.14em] text-white/35">
      {entries
        .map(([id, n]) => {
          const name = providerDisplayName(id).toLowerCase();
          return n > 1 ? `${n} ${name}` : name;
        })
        .join(' · ')}
    </span>
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
