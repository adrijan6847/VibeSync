'use client';

/**
 * Search input with rotating, animated placeholder suggestions.
 * Adapted from the 21st.dev "SuggestiveSearch" scaffold — rewired to
 * drive the provider-agnostic music.search / music.load pipeline and
 * restyled to VibeSync's palette (ice-on-carbon, no shadcn tokens).
 *
 * Three built-in placeholder effects: typewriter, slide, fade. While
 * the input is empty and unfocused, the overlay cycles through
 * suggestions using the selected effect. As soon as the user types,
 * the overlay hides and result items render underneath.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CanonicalTrack } from '@/music/types';

export interface EffectRendererProps {
  text: string;
  isActive: boolean;
  allowDelete?: boolean;
  typeDurationMs: number;
  deleteDurationMs: number;
  pauseAfterTypeMs: number;
  prefersReducedMotion?: boolean;
  onDeleteComplete?: () => void;
  containerRef?: RefObject<HTMLElement | null>;
}

export type BuiltinEffect = 'typewriter' | 'slide' | 'fade' | 'none';

export interface SuggestiveSearchProps {
  onSearch: (query: string, limit?: number) => Promise<CanonicalTrack[]>;
  onPick: (track: CanonicalTrack) => void;
  suggestions?: string[];
  className?: string;
  effect?: BuiltinEffect;
  typeDurationMs?: number;
  deleteDurationMs?: number;
  pauseAfterTypeMs?: number;
  animateMode?: 'infinite' | 'once';
}

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

export function SuggestiveSearch({
  onSearch,
  onPick,
  suggestions = [
    'search a track…',
    'try "Midnight City"',
    'or an artist you love',
  ],
  className,
  effect = 'typewriter',
  typeDurationMs = 700,
  deleteDurationMs = 400,
  pauseAfterTypeMs = 1500,
  animateMode = 'infinite',
}: SuggestiveSearchProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<CanonicalTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const leadingRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [leftOffsetPx, setLeftOffsetPx] = useState<number | null>(null);
  const [rightOffsetPx, setRightOffsetPx] = useState<number | null>(null);
  const [measuredLongestTextPx, setMeasuredLongestTextPx] = useState<
    number | null
  >(null);
  const [availableTextAreaPx, setAvailableTextAreaPx] = useState<number | null>(
    null,
  );

  const current = useMemo(
    () => suggestions[index] ?? '',
    [suggestions, index],
  );
  const longestSuggestion = useMemo(
    () => suggestions.reduce((a, b) => (a.length > b.length ? a : b), ''),
    [suggestions],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const lead = leadingRef.current;
    if (!wrapper) return;

    const update = () => {
      const cs = getComputedStyle(wrapper);
      const padLeft = parseFloat(cs.paddingLeft || '0');
      const padRight = parseFloat(cs.paddingRight || '0');
      const leadW = lead?.getBoundingClientRect().width ?? 0;
      const left = padLeft + leadW + 8;
      setLeftOffsetPx(left);
      setRightOffsetPx(padRight);
      const wrapperW = wrapper.getBoundingClientRect().width;
      setAvailableTextAreaPx(Math.max(0, wrapperW - left - padRight));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    if (lead) ro.observe(lead);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!longestSuggestion) {
      setMeasuredLongestTextPx(null);
      return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const elForFont = input ?? wrapperRef.current;
    if (elForFont) {
      const cs = getComputedStyle(elForFont);
      ctx.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
    } else {
      ctx.font = '13px system-ui, sans-serif';
    }
    setMeasuredLongestTextPx(Math.ceil(ctx.measureText(longestSuggestion).width) + 8);
  }, [longestSuggestion]);

  // Live search: debounce query, stream into `music.search`, keep only
  // the latest in-flight request's results.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await onSearch(q, 6);
        if (reqIdRef.current !== myReq) return;
        setResults(r);
      } catch {
        if (reqIdRef.current === myReq) setResults([]);
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, onSearch]);

  const effectMap: Record<BuiltinEffect, ComponentType<EffectRendererProps> | null> = {
    typewriter: TypewriterEffect,
    slide: SlideEffect,
    fade: FadeEffect,
    none: null,
  };
  const ChosenEffect = effectMap[effect];

  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const overlayActive = !query && !focused;
  const isLast = index === suggestions.length - 1;
  const allowDelete = animateMode === 'infinite' ? true : !isLast;

  const minWidthPx =
    measuredLongestTextPx != null && availableTextAreaPx != null
      ? Math.min(measuredLongestTextPx, availableTextAreaPx)
      : measuredLongestTextPx ?? undefined;

  const handlePick = (t: CanonicalTrack) => {
    onPick(t);
    setQuery('');
    setResults([]);
    inputRef.current?.blur();
  };

  const showNoMatches =
    query.trim().length >= MIN_QUERY && !loading && results.length === 0;

  return (
    <div className={`flex w-full flex-col items-stretch gap-2 ${className ?? ''}`}>
      <div
        ref={wrapperRef}
        className="panel relative flex items-center gap-x-2 rounded-full py-2 pl-3 pr-4 backdrop-blur-xl"
      >
        <div ref={leadingRef} className="flex-shrink-0 text-[var(--fg-mute)]">
          <SearchGlyph />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('');
              inputRef.current?.blur();
            }
          }}
          placeholder=""
          aria-label="Search for a track"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-6 w-full min-w-0 bg-transparent text-[13px] font-medium tracking-[-0.005em] text-white outline-none placeholder:text-transparent"
          style={minWidthPx != null ? { minWidth: `${minWidthPx}px` } : undefined}
        />

        {loading && (
          <span
            aria-live="polite"
            className="label-caps ml-1 shrink-0 text-[var(--fg-mute)]"
          >
            …
          </span>
        )}

        {overlayActive && ChosenEffect && (
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none"
            style={{
              position: 'absolute',
              left: leftOffsetPx != null ? `${leftOffsetPx}px` : undefined,
              right: rightOffsetPx != null ? `${rightOffsetPx}px` : undefined,
              top: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <ChosenEffect
              text={current}
              isActive={overlayActive}
              allowDelete={allowDelete}
              typeDurationMs={typeDurationMs}
              deleteDurationMs={deleteDurationMs}
              pauseAfterTypeMs={pauseAfterTypeMs}
              prefersReducedMotion={prefersReduced}
              onDeleteComplete={() =>
                setIndex((i) => (i + 1) % suggestions.length)
              }
              containerRef={overlayRef}
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {(results.length > 0 || showNoMatches) && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="panel flex max-h-[280px] w-full flex-col overflow-y-auto rounded-2xl p-2 backdrop-blur-xl"
          >
            {showNoMatches ? (
              <div className="label-caps px-2 py-3 text-[var(--fg-mute)]">
                no matches
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {results.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(t)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-180 hover:bg-white/[0.05]"
                    >
                      <Artwork url={t.artworkUrl} title={t.title} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] font-medium tracking-[-0.005em] text-white">
                          {t.title}
                        </span>
                        <span className="truncate text-[11.5px] text-[var(--fg-soft)]">
                          {t.artist}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────── built-in effects ─────────────────────── */

const TypewriterEffect: ComponentType<EffectRendererProps> = ({
  text,
  isActive,
  allowDelete = true,
  typeDurationMs,
  deleteDurationMs,
  pauseAfterTypeMs,
  prefersReducedMotion,
  onDeleteComplete,
  containerRef,
}) => {
  const [phase, setPhase] = useState<'typing' | 'paused' | 'deleting'>('typing');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setPhase('typing');
    const pending = timers.current;
    pending.forEach(window.clearTimeout);
    timers.current = [];
    return () => {
      pending.forEach(window.clearTimeout);
    };
  }, [text, isActive, allowDelete]);

  useEffect(() => {
    if (isActive) return;
    const pending = timers.current;
    setPhase('typing');
    pending.forEach(window.clearTimeout);
    timers.current = [];
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !prefersReducedMotion || !allowDelete) return;
    const t = window.setTimeout(
      () => onDeleteComplete?.(),
      Math.max(200, pauseAfterTypeMs),
    );
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [isActive, prefersReducedMotion, allowDelete, pauseAfterTypeMs, onDeleteComplete]);

  if (!isActive) return null;

  if (prefersReducedMotion) {
    return (
      <span className="text-[13px] text-[var(--fg-mute)] select-none">
        {text}
      </span>
    );
  }

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement> | undefined}
      style={{
        display: 'inline-block',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <motion.div
        key={text}
        initial={{ width: '0%' }}
        animate={
          phase === 'deleting' ? { width: '0%' } : { width: '100%' }
        }
        transition={{
          duration: (phase === 'deleting' ? deleteDurationMs : typeDurationMs) / 1000,
          ease: 'linear',
        }}
        onAnimationComplete={() => {
          if (phase === 'typing') {
            setPhase('paused');
            if (allowDelete) {
              const t = window.setTimeout(
                () => setPhase('deleting'),
                pauseAfterTypeMs,
              );
              timers.current.push(t);
            }
          } else if (phase === 'deleting') {
            onDeleteComplete?.();
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <span className="text-[13px] text-[var(--fg-mute)] select-none">
          {text}
        </span>
        <motion.span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 1,
            marginLeft: 4,
            height: '1.05em',
            background: 'var(--fg-mute)',
          }}
          animate={
            phase === 'deleting' ? { opacity: 0 } : { opacity: [0, 1, 0] }
          }
          transition={
            phase === 'deleting'
              ? { duration: 0.1 }
              : { repeat: Infinity, duration: 0.9, ease: 'linear' }
          }
        />
      </motion.div>
    </div>
  );
};

const SlideEffect: ComponentType<EffectRendererProps> = ({
  text,
  isActive,
  allowDelete = true,
  typeDurationMs,
  deleteDurationMs,
  pauseAfterTypeMs,
  prefersReducedMotion,
  onDeleteComplete,
  containerRef,
}) => {
  const [phase, setPhase] = useState<'enter' | 'pause' | 'exit'>('enter');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setPhase('enter');
    const pending = timers.current;
    pending.forEach(window.clearTimeout);
    timers.current = [];
    return () => pending.forEach(window.clearTimeout);
  }, [text, isActive, allowDelete]);

  useEffect(() => {
    if (isActive) return;
    const pending = timers.current;
    setPhase('enter');
    pending.forEach(window.clearTimeout);
    timers.current = [];
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !prefersReducedMotion || !allowDelete) return;
    const t = window.setTimeout(
      () => onDeleteComplete?.(),
      Math.max(200, pauseAfterTypeMs),
    );
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [isActive, prefersReducedMotion, allowDelete, pauseAfterTypeMs, onDeleteComplete]);

  if (!isActive) return null;

  if (prefersReducedMotion) {
    return (
      <span className="text-[13px] text-[var(--fg-mute)] select-none">
        {text}
      </span>
    );
  }

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement> | undefined}
      style={{
        display: 'inline-block',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <motion.div
        key={text}
        initial={{ y: '-100%' }}
        animate={phase === 'exit' ? { y: '100%' } : { y: '0%' }}
        transition={{
          duration: (phase === 'exit' ? deleteDurationMs : typeDurationMs) / 1000,
          ease: phase === 'exit' ? 'easeIn' : 'easeOut',
        }}
        onAnimationComplete={() => {
          if (phase === 'enter') {
            setPhase('pause');
            if (allowDelete) {
              const t = window.setTimeout(
                () => setPhase('exit'),
                pauseAfterTypeMs,
              );
              timers.current.push(t);
            }
          } else if (phase === 'exit') {
            onDeleteComplete?.();
          }
        }}
        style={{ display: 'inline-block' }}
      >
        <span className="text-[13px] text-[var(--fg-mute)] select-none">
          {text}
        </span>
      </motion.div>
    </div>
  );
};

const FadeEffect: ComponentType<EffectRendererProps> = ({
  text,
  isActive,
  allowDelete = true,
  typeDurationMs,
  deleteDurationMs,
  pauseAfterTypeMs,
  prefersReducedMotion,
  onDeleteComplete,
  containerRef,
}) => {
  const [phase, setPhase] = useState<'fadeIn' | 'hold' | 'fadeOut'>('fadeIn');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setPhase('fadeIn');
    const pending = timers.current;
    pending.forEach(window.clearTimeout);
    timers.current = [];
    return () => pending.forEach(window.clearTimeout);
  }, [text, isActive, allowDelete]);

  useEffect(() => {
    if (isActive) return;
    const pending = timers.current;
    setPhase('fadeIn');
    pending.forEach(window.clearTimeout);
    timers.current = [];
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !prefersReducedMotion || !allowDelete) return;
    const t = window.setTimeout(
      () => onDeleteComplete?.(),
      Math.max(200, pauseAfterTypeMs),
    );
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [isActive, prefersReducedMotion, allowDelete, pauseAfterTypeMs, onDeleteComplete]);

  if (!isActive) return null;

  if (prefersReducedMotion) {
    return (
      <span className="text-[13px] text-[var(--fg-mute)] select-none">
        {text}
      </span>
    );
  }

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement> | undefined}
      style={{
        display: 'inline-block',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <motion.div
        key={text}
        initial={{ opacity: 0 }}
        animate={phase === 'fadeOut' ? { opacity: 0 } : { opacity: 1 }}
        transition={{
          duration: (phase === 'fadeOut' ? deleteDurationMs : typeDurationMs) / 1000,
        }}
        onAnimationComplete={() => {
          if (phase === 'fadeIn') {
            setPhase('hold');
            if (allowDelete) {
              const t = window.setTimeout(
                () => setPhase('fadeOut'),
                pauseAfterTypeMs,
              );
              timers.current.push(t);
            }
          } else if (phase === 'fadeOut') {
            onDeleteComplete?.();
          }
        }}
        style={{ display: 'inline-block' }}
      >
        <span className="text-[13px] text-[var(--fg-mute)] select-none">
          {text}
        </span>
      </motion.div>
    </div>
  );
};

/* ─────────────────────── leaf atoms ─────────────────────── */

function SearchGlyph(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M10.8 10.8 L14 14" />
    </svg>
  );
}

function Artwork({ url, title }: { url?: string; title: string }) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="h-9 w-9 shrink-0 rounded-md border border-[var(--stroke)] bg-white/[0.03]"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-label={title}
      width={36}
      height={36}
      className="h-9 w-9 shrink-0 rounded-md border border-[var(--stroke)] object-cover"
      loading="lazy"
    />
  );
}
