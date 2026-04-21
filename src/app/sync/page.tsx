'use client';

/**
 * Music-platform sync gate. Drop-in of the 21st.dev SignInPage scaffold,
 * rethemed in VibeSync's ice-blue + carbon palette and rewired so each
 * of the scaffold's three steps maps to a real moment in the host flow:
 *
 *   step "connect"  ← the email step:    Sign in with Spotify / Apple Music
 *   step "code"     ← the 6-digit step:  the room's 4-letter code animates
 *                                         into the pin slots after the
 *                                         server mints a session
 *   step "success"  ← unchanged shape:   checkmark + Enter the room
 *
 * The two-canvas handoff is preserved: forward CanvasRevealEffect plays
 * on arrival, reverse plays when the user locks the code in.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CanvasRevealEffect } from '@/components/shader/CanvasRevealEffect';
import { getSocket } from '@/lib/socket';
import type { CreateResponse } from '@/lib/types';
import { getAdapter, setPendingProvider } from '@/music/adapters';
// Side-effect: registers Spotify + Apple Music adapters
import '@/music/adapters/register';
import {
  hasSpotifyClientId,
  spotifyHostMismatch,
  startSpotifyLogin,
} from '@/music/adapters/spotify-auth';

const SPOTIFY_TOKEN_KEY = 'vs.spotify.token';
const ROOM_CODE_LENGTH = 4;

type Status = 'idle' | 'busy' | 'linked';

export default function Page() {
  return <SyncPage />;
}

function SyncPage({ className }: { className?: string }) {
  const router = useRouter();

  const [step, setStep] = useState<'connect' | 'code' | 'success'>('connect');
  const [spotify, setSpotify] = useState<Status>('idle');
  const [apple, setApple] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState<string[]>(
    Array(ROOM_CODE_LENGTH).fill(''),
  );
  const [mintingCode, setMintingCode] = useState(false);

  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);

  const didMount = useRef(false);
  // One-shot: auto-mint fires when both providers first arrive linked
  // (typically the return trip from Spotify's OAuth). After Back from
  // the code screen we don't want to re-fire — the user is back in
  // control and must press "Open your room" explicitly.
  const autoMintedRef = useRef(false);

  // Reflect existing tokens on mount (handles Spotify's PKCE return).
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    try {
      if (window.localStorage.getItem(SPOTIFY_TOKEN_KEY)) setSpotify('linked');
    } catch {
      /* storage disabled */
    }
    try {
      const adapter = getAdapter('apple');
      if (adapter.isAuthenticated()) setApple('linked');
    } catch {
      /* adapter not yet registered */
    }
  }, []);

  function mintCode() {
    if (mintingCode) return;
    setMintingCode(true);
    const s = getSocket();
    if (!s.connected) s.connect();

    const onReady = () => {
      s.emit('session:create', {}, (r: CreateResponse) => {
        const letters = (r.code ?? '').toUpperCase().slice(0, ROOM_CODE_LENGTH);
        const padded = letters.padEnd(ROOM_CODE_LENGTH, ' ').split('');
        padded.forEach((ch, i) => {
          window.setTimeout(() => {
            setCode((prev) => {
              const next = [...prev];
              next[i] = ch === ' ' ? '' : ch;
              return next;
            });
          }, 180 * i);
        });
        setStep('code');
      });
    };

    if (s.connected) onReady();
    else s.once('connect', onReady);
  }

  // Both providers linked → mint a session and roll to the code reveal.
  // Only fires once per page load; Back from the code screen does not
  // re-trigger the mint.
  useEffect(() => {
    if (step !== 'connect') return;
    if (spotify !== 'linked' || apple !== 'linked') return;
    if (autoMintedRef.current) return;
    autoMintedRef.current = true;
    mintCode();
    // mintCode is stable within a render — intentional one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotify, apple, step]);

  async function handleSpotify() {
    if (spotify !== 'idle') return;
    setError(null);
    setSpotify('busy');

    const mismatch = spotifyHostMismatch();
    if (mismatch) {
      setError(
        `Spotify sign-in only works from ${mismatch.expectedOrigin}. Open that URL and try again.`,
      );
      setSpotify('idle');
      return;
    }
    if (!hasSpotifyClientId()) {
      setError(
        'Spotify isn’t configured — set NEXT_PUBLIC_SPOTIFY_CLIENT_ID and redeploy.',
      );
      setSpotify('idle');
      return;
    }

    try {
      await startSpotifyLogin('/sync');
      // Browser navigates to Spotify — callback route returns us here.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSpotify('idle');
    }
  }

  async function handleApple() {
    if (apple !== 'idle') return;
    setError(null);
    setApple('busy');
    try {
      const adapter = getAdapter('apple');
      await adapter.authenticate();
      if (!adapter.isAuthenticated()) {
        throw new Error('Apple Music didn’t finish signing in. Try again.');
      }
      setApple('linked');
    } catch (err) {
      setError(friendlyAppleError(err));
      setApple('idle');
    }
  }

  async function handleSpotifyDisconnect() {
    if (spotify !== 'linked') return;
    setError(null);
    try {
      await getAdapter('spotify').signOut();
    } catch {
      // signOut is best-effort; still clear local state below.
    }
    try {
      window.localStorage.removeItem(SPOTIFY_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setSpotify('idle');
    // Any minted room code is tied to the previous host identity. Clear
    // it so the user has to re-confirm once they reconnect.
    setCode(Array(ROOM_CODE_LENGTH).fill(''));
    setMintingCode(false);
  }

  async function handleAppleDisconnect() {
    if (apple !== 'linked') return;
    setError(null);
    try {
      await getAdapter('apple').signOut();
    } catch {
      /* ignore */
    }
    setApple('idle');
    setCode(Array(ROOM_CODE_LENGTH).fill(''));
    setMintingCode(false);
  }

  function handleBackFromCode() {
    // Preserve linked credentials — just bounce back to the connect step.
    // Do NOT reset autoMintedRef; the user will proceed via the explicit
    // "Open your room" button so Back doesn't trampoline them forward.
    setStep('connect');
    setReverseCanvasVisible(false);
    setInitialCanvasVisible(true);
  }

  function handleOpenRoom() {
    // Manual equivalent of the auto-mint. Used after Back (code already
    // minted → just reveal) and after disconnect/reconnect (no code yet
    // → mint a fresh one).
    if (code.every((c) => c !== '')) {
      setStep('code');
      return;
    }
    autoMintedRef.current = true;
    mintCode();
  }

  function handleLockIn() {
    if (!code.every((c) => c !== '')) return;
    // Same handoff the original scaffold uses on pin completion.
    setReverseCanvasVisible(true);
    window.setTimeout(() => setInitialCanvasVisible(false), 50);
    window.setTimeout(() => setStep('success'), 2000);
  }

  function enterRoom() {
    const joined = code.join('');
    if (joined.length !== ROOM_CODE_LENGTH) return;
    // Hand the room a preselected provider so MusicPanel doesn't
    // re-prompt "Pick your music service" — both are linked here,
    // Spotify is the primary surface, so default to it.
    setPendingProvider('spotify');
    router.push(`/s/${joined}?host=1`);
  }

  const codeReady = code.every((c) => c !== '');

  return (
    <div
      className={`flex w-[100%] flex-col min-h-screen bg-black relative ${className ?? ''}`}
    >
      <div className="absolute inset-0 z-0">
        {/* Initial canvas (forward animation) */}
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={3}
              containerClassName="bg-black"
              colors={[
                [188, 220, 255],
                [158, 201, 255],
              ]}
              dotSize={6}
              reverse={false}
            />
          </div>
        )}

        {/* Reverse canvas (appears when the code locks in) */}
        {reverseCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={4}
              containerClassName="bg-black"
              colors={[
                [188, 220, 255],
                [158, 201, 255],
              ]}
              dotSize={6}
              reverse={true}
            />
          </div>
        )}

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Top navigation */}
        <MiniNavbar />

        {/* Main content container */}
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex-1 flex flex-col justify-center items-center">
            <div className="w-full mt-[150px] max-w-sm px-6">
              <AnimatePresence mode="wait">
                {step === 'connect' ? (
                  <motion.div
                    key="connect-step"
                    initial={{ opacity: 0, x: -100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="hero-title text-[2.5rem] leading-[1.1] tracking-tight text-white">
                        Sync your sound
                      </h1>
                      <p className="text-[1.4rem] text-white/55 font-light">
                        before the room goes live
                      </p>
                    </div>

                    <div className="space-y-3">
                      <ProviderTile
                        provider="spotify"
                        status={spotify}
                        onConnect={handleSpotify}
                        onDisconnect={handleSpotifyDisconnect}
                      />

                      <ProviderTile
                        provider="apple"
                        status={apple}
                        onConnect={handleApple}
                        onDisconnect={handleAppleDisconnect}
                      />
                    </div>

                    <AnimatePresence>
                      {spotify === 'linked' && apple === 'linked' && (
                        <motion.button
                          key="proceed"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                          onClick={handleOpenRoom}
                          disabled={mintingCode}
                          className="w-full rounded-full bg-white text-black font-medium py-3 hover:bg-white/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {mintingCode ? 'Minting your room…' : 'Open your room'}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {error && (
                        <motion.p
                          key={error}
                          initial={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, filter: 'blur(4px)' }}
                          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                          className="text-[12.5px] leading-snug text-[#e8b4b4]/80"
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <p className="text-xs text-white/40 pt-8">
                      Tokens stay in this browser only. By continuing, you
                      agree to the{' '}
                      <Link
                        href="#"
                        className="underline text-white/40 hover:text-white/60 transition-colors"
                      >
                        Terms
                      </Link>{' '}
                      and{' '}
                      <Link
                        href="#"
                        className="underline text-white/40 hover:text-white/60 transition-colors"
                      >
                        Privacy Notice
                      </Link>
                      .
                    </p>
                  </motion.div>
                ) : step === 'code' ? (
                  <motion.div
                    key="code-step"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="hero-title text-[2.5rem] leading-[1.1] tracking-tight text-white">
                        Your room is ready
                      </h1>
                      <p className="text-[1.25rem] text-white/55 font-light">
                        Share this code with the room
                      </p>
                    </div>

                    <div className="w-full">
                      <div className="relative rounded-full py-4 px-5 border border-[var(--stroke-strong)] bg-black/30">
                        <div className="flex items-center justify-center">
                          {code.map((letter, i) => (
                            <div key={i} className="flex items-center">
                              <div className="relative w-10 text-center">
                                <AnimatePresence mode="wait">
                                  {letter ? (
                                    <motion.span
                                      key={`${i}-${letter}`}
                                      initial={{
                                        y: 18,
                                        opacity: 0,
                                        filter: 'blur(6px)',
                                      }}
                                      animate={{
                                        y: 0,
                                        opacity: 1,
                                        filter: 'blur(0px)',
                                      }}
                                      exit={{ opacity: 0, y: -8 }}
                                      transition={{
                                        duration: 0.35,
                                        ease: [0.23, 1, 0.32, 1],
                                      }}
                                      className="mono block text-[22px] font-medium tracking-[0.04em] text-white"
                                    >
                                      {letter}
                                    </motion.span>
                                  ) : (
                                    <span className="mono block text-[22px] font-medium text-white/20">
                                      •
                                    </span>
                                  )}
                                </AnimatePresence>
                              </div>
                              {i < ROOM_CODE_LENGTH - 1 && (
                                <span className="text-white/15 text-xl">
                                  |
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <motion.p
                        className="label-caps text-white/50 hover:text-white/70 transition-colors cursor-default"
                        whileHover={{ scale: 1.02 }}
                        transition={{ duration: 0.2 }}
                      >
                        synced via Spotify · Apple Music
                      </motion.p>
                    </div>

                    <div className="flex w-full gap-3">
                      <motion.button
                        onClick={handleBackFromCode}
                        className="rounded-full border border-white/15 bg-white/[0.04] text-white/85 font-medium px-8 py-3 hover:bg-white/[0.08] transition-colors w-[30%]"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                      >
                        Back
                      </motion.button>
                      <motion.button
                        onClick={handleLockIn}
                        className={`flex-1 rounded-full font-medium py-3 border transition-all duration-300 ${
                          codeReady
                            ? 'bg-white text-black border-transparent hover:bg-white/90 cursor-pointer'
                            : 'bg-[#111] text-white/50 border-white/10 cursor-not-allowed'
                        }`}
                        disabled={!codeReady}
                      >
                        Lock it in
                      </motion.button>
                    </div>

                    <div className="pt-10">
                      <p className="text-xs text-white/40">
                        The room opens when you lock the code in. Anyone
                        with it can join as a participant.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success-step"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut', delay: 0.3 }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="hero-title text-[2.5rem] leading-[1.1] tracking-tight text-white">
                        You’re in sync
                      </h1>
                      <p className="text-[1.25rem] text-white/55 font-light">
                        Room · {code.join('')}
                      </p>
                    </div>

                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                      className="py-10"
                    >
                      <div
                        className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                        style={{
                          background:
                            'linear-gradient(135deg, #bcdcff 0%, #eef2f6 55%, #8a99a8 100%)',
                          boxShadow: '0 0 40px rgba(188, 220, 255, 0.28)',
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-8 w-8 text-black"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </motion.div>

                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      onClick={enterRoom}
                      className="w-full rounded-full bg-white text-black font-medium py-3 hover:bg-white/90 transition-colors"
                    >
                      Enter the room
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────── MiniNavbar — same scaffold, VibeSync palette ───────────── */

function MiniNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [headerShapeClass, setHeaderShapeClass] = useState('rounded-full');
  const shapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMenu = () => setIsOpen((v) => !v);

  useEffect(() => {
    if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    if (isOpen) {
      setHeaderShapeClass('rounded-xl');
    } else {
      shapeTimeoutRef.current = setTimeout(() => {
        setHeaderShapeClass('rounded-full');
      }, 300);
    }
    return () => {
      if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    };
  }, [isOpen]);

  const logoElement = <NavLogo />;

  const navLinksData = useMemo(
    () => [
      { label: 'Manifesto', href: '/' },
      { label: 'How it works', href: '/' },
      { label: 'Discover', href: '/' },
    ],
    [],
  );

  const loginButtonElement = (
    <Link
      href="/"
      className="px-4 py-2 sm:px-3 text-xs sm:text-sm border border-[var(--stroke-strong)] bg-[rgba(10,12,16,0.62)] text-gray-300 rounded-full hover:border-white/40 hover:text-white transition-colors duration-200 w-full sm:w-auto text-center inline-block"
    >
      Cancel
    </Link>
  );

  const signupButtonElement = (
    <div className="relative group w-full sm:w-auto">
      <div
        className="absolute inset-0 -m-2 rounded-full
                     hidden sm:block
                     opacity-40 filter blur-lg pointer-events-none
                     transition-all duration-300 ease-out
                     group-hover:opacity-60 group-hover:blur-xl group-hover:-m-3"
        style={{
          background:
            'linear-gradient(135deg, #bcdcff 0%, #eef2f6 55%, #8a99a8 100%)',
        }}
      />
      <Link
        href="/"
        className="relative z-10 inline-block px-4 py-2 sm:px-3 text-xs sm:text-sm font-semibold text-black rounded-full transition-all duration-200 w-full sm:w-auto text-center"
        style={{
          background:
            'linear-gradient(135deg, #eef2f6 0%, #bcdcff 50%, #8a99a8 100%)',
        }}
      >
        Back home
      </Link>
    </div>
  );

  return (
    <header
      className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-20
                       flex flex-col items-center
                       pl-6 pr-6 py-3 backdrop-blur-sm
                       ${headerShapeClass}
                       border border-[var(--stroke-strong)] bg-[rgba(10,12,16,0.55)]
                       w-[calc(100%-2rem)] sm:w-auto
                       transition-[border-radius] duration-0 ease-in-out`}
    >
      <div className="flex items-center justify-between w-full gap-x-6 sm:gap-x-8">
        <div className="flex items-center gap-2.5">
          {logoElement}
          <span className="label-caps text-white/55">VibeSync</span>
        </div>

        <nav className="hidden sm:flex items-center space-x-4 sm:space-x-6 text-sm">
          {navLinksData.map((link) => (
            <AnimatedNavLink key={link.label} href={link.href}>
              {link.label}
            </AnimatedNavLink>
          ))}
        </nav>

        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
          {loginButtonElement}
          {signupButtonElement}
        </div>

        <button
          className="sm:hidden flex items-center justify-center w-8 h-8 text-gray-300 focus:outline-none"
          onClick={toggleMenu}
          aria-label={isOpen ? 'Close Menu' : 'Open Menu'}
        >
          {isOpen ? (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
      </div>

      <div
        className={`sm:hidden flex flex-col items-center w-full transition-all ease-in-out duration-300 overflow-hidden
                       ${isOpen ? 'max-h-[1000px] opacity-100 pt-4' : 'max-h-0 opacity-0 pt-0 pointer-events-none'}`}
      >
        <nav className="flex flex-col items-center space-y-4 text-base w-full">
          {navLinksData.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-gray-300 hover:text-white transition-colors w-full text-center"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col items-center space-y-4 mt-4 w-full">
          {loginButtonElement}
          {signupButtonElement}
        </div>
      </div>
    </header>
  );
}

function AnimatedNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative inline-flex h-5 items-center overflow-hidden text-sm"
    >
      <div className="flex flex-col transition-transform duration-400 ease-out transform group-hover:-translate-y-1/2">
        <span className="text-white/55">{children}</span>
        <span className="text-white">{children}</span>
      </div>
    </Link>
  );
}

function NavLogo() {
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="relative h-5 w-5"
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 210deg, #bcdcff, #e8eff7, #8a99a8, #1a1f26, #9ec9ff, #bcdcff)',
          filter: 'blur(2px)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-[2.5px] rounded-full bg-[var(--bg-deep)]" />
      <div className="absolute inset-[5.5px] rounded-full bg-white/95" />
    </motion.div>
  );
}

/* ────────────── Provider marks + tile + status + copy ────────────── */

/**
 * Official Spotify glyph (green circle with three sound-wave bars).
 * Sourced from Spotify's public brand assets. Do not recolor — Spotify's
 * brand guidelines require the logo be shown in its brand green or pure
 * black/white. We use brand green here.
 */
function SpotifyMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 168 168" aria-hidden>
      <circle cx="84" cy="84" r="84" fill="#1ED760" />
      <path
        fill="#000"
        d="M122.4 121.057a5.23 5.23 0 0 1-7.183 1.737c-19.662-12.013-44.414-14.725-73.562-8.064a5.222 5.222 0 0 1-6.248-3.93 5.214 5.214 0 0 1 3.925-6.25c31.9-7.291 59.263-4.15 81.338 9.335a5.227 5.227 0 0 1 1.73 7.172zm10.256-22.803c-1.895 3.076-5.913 4.043-8.986 2.155-22.507-13.837-56.822-17.846-83.448-9.764-3.452 1.044-7.098-.902-8.145-4.35a6.537 6.537 0 0 1 4.353-8.143c30.413-9.228 68.222-4.754 94.07 11.127 3.074 1.89 4.045 5.911 2.156 8.975zm.881-23.744C107.534 59.5 63.065 57.963 37.385 65.758c-4.138 1.256-8.517-1.08-9.772-5.218a7.837 7.837 0 0 1 5.223-9.772c29.48-8.948 78.625-7.226 108.15 10.307 3.722 2.208 4.94 7.017 2.734 10.733-2.2 3.722-7.02 4.945-10.73 2.734z"
      />
    </svg>
  );
}

/**
 * Apple Music glyph — the rounded-square mark with the red-pink gradient
 * and white note shape. Based on Apple's Marketing Resources guidelines
 * for services; usable to indicate connection with the Apple Music
 * service as long as colors and proportions are preserved.
 */
function AppleMark({ size = 20 }: { size?: number }) {
  const gradId = 'vs-apple-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#FA233B" />
          <stop offset="100%" stopColor="#FB5C74" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="9.5" fill={`url(#${gradId})`} />
      <path
        fill="#fff"
        d="M27.9 10.14a1.18 1.18 0 0 0-.52-.78 1.55 1.55 0 0 0-1.06-.2c-.22.03-.45.08-.67.12l-9.83 1.98c-.28.06-.53.13-.77.27a1.15 1.15 0 0 0-.54.78c-.03.17-.04.34-.04.51V25.5l-.03.05a.33.33 0 0 1-.24.09c-.56.06-1.13.1-1.69.17a4.3 4.3 0 0 0-1.5.43c-.92.45-1.47 1.2-1.47 2.24 0 .9.4 1.61 1.07 2.13.68.52 1.48.72 2.33.7.52 0 1.03-.1 1.51-.32.76-.35 1.23-.95 1.35-1.78.03-.18.04-.36.04-.55V17.96c0-.34.06-.42.39-.5l1.29-.26 6.57-1.36c.23-.04.46-.09.69-.12a.47.47 0 0 1 .51.4c.02.14.03.28.03.43v5.82l-.03.05a.33.33 0 0 1-.24.09c-.56.06-1.13.1-1.69.17a4.3 4.3 0 0 0-1.5.43c-.92.45-1.47 1.2-1.47 2.24 0 .9.4 1.61 1.07 2.13.68.52 1.48.72 2.33.7.52 0 1.03-.1 1.51-.32.76-.35 1.23-.95 1.35-1.78.03-.18.04-.36.04-.55V11.15c0-.34-.02-.68-.09-1.01z"
      />
    </svg>
  );
}

/**
 * Single provider row: shows its logo, a label that reflects the current
 * connection status, and an action slot on the right. When connected,
 * the action swaps from "Sign in" → "Disconnect" so there's always a way
 * both IN and OUT of the connection.
 */
function ProviderTile({
  provider,
  status,
  onConnect,
  onDisconnect,
}: {
  provider: 'spotify' | 'apple';
  status: Status;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isSpotify = provider === 'spotify';
  const displayName = isSpotify ? 'Spotify' : 'Apple Music';
  const subtle =
    status === 'linked'
      ? 'Connected'
      : status === 'busy'
        ? isSpotify
          ? 'Redirecting to Spotify…'
          : 'Opening Apple Music…'
        : 'Not connected';

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors ${
        status === 'linked'
          ? 'border-white/15 bg-white/[0.04]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center">
        {isSpotify ? <SpotifyMark size={28} /> : <AppleMark size={28} />}
      </div>

      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-white">
            {displayName}
          </span>
          <StatusPill status={status} />
        </div>
        <span className="label-caps block truncate text-[var(--fg-mute)]">
          {subtle}
        </span>
      </div>

      {status === 'linked' ? (
        <button
          type="button"
          onClick={onDisconnect}
          className="label-caps shrink-0 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
          aria-label={`Disconnect ${displayName}`}
        >
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={status === 'busy'}
          className="label-caps shrink-0 rounded-full bg-white px-3 py-1.5 text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
          aria-label={`Connect ${displayName}`}
        >
          {status === 'busy' ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  if (status === 'linked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(188,220,255,0.12)] px-1.5 py-[1px]">
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: 'rgba(188, 220, 255, 0.5)' }}
          />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--ice)]" />
        </span>
        <span className="mono text-[9.5px] font-medium tracking-[0.14em] uppercase text-[var(--ice)]">
          Live
        </span>
      </span>
    );
  }
  if (status === 'busy') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-[1px]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/50 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white/70" />
        </span>
        <span className="mono text-[9.5px] font-medium tracking-[0.14em] uppercase text-white/70">
          Syncing
        </span>
      </span>
    );
  }
  return null;
}

function friendlyAppleError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (msg === 'apple_devtoken_missing') {
    return 'Apple Music isn’t configured — set NEXT_PUBLIC_APPLE_DEVELOPER_TOKEN.';
  }
  if (lower.includes('cancel')) return 'Sign-in was cancelled. Tap to try again.';
  if (lower.includes('subscription'))
    return 'An active Apple Music subscription is required.';
  if (lower.includes('authoriz'))
    return 'Apple Music didn’t authorize the request. Try again.';
  return 'Couldn’t reach Apple Music. Try again in a moment.';
}
