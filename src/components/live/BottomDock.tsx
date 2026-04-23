'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { providerDisplayName } from '@/music/adapters';
import type { Participant } from '@/lib/types';
import type { CanonicalTrack } from '@/music/types';

type BottomDockProps = {
  queue: CanonicalTrack[];
  participants: Participant[];
  youId?: string;
};

type Panel = 'queue' | 'lyrics' | 'devices' | 'room';

/**
 * Persistent bottom pill. Four buttons; each opens a sheet that slides
 * from the bottom. Backdrop click or Escape closes. Sheet contents are
 * v1 stubs — queue is read-only, lyrics and devices show copy, room
 * is the only fully-wired panel.
 */
export function BottomDock({ queue, participants, youId }: BottomDockProps) {
  const [open, setOpen] = useState<Panel | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-5 sm:bottom-7">
        <div className="pointer-events-auto panel flex items-stretch gap-0 rounded-full px-1 py-1 backdrop-blur-xl">
          <DockItem
            label="Queue"
            active={open === 'queue'}
            onClick={() => setOpen(open === 'queue' ? null : 'queue')}
          />
          <Divider />
          <DockItem
            label="Lyrics"
            active={open === 'lyrics'}
            onClick={() => setOpen(open === 'lyrics' ? null : 'lyrics')}
          />
          <Divider />
          <DockItem
            label="Devices"
            active={open === 'devices'}
            onClick={() => setOpen(open === 'devices' ? null : 'devices')}
          />
          <Divider />
          <DockItem
            label={`Room · ${participants.length}`}
            active={open === 'room'}
            onClick={() => setOpen(open === 'room' ? null : 'room')}
          />
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(null)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
        )}
        {open === 'queue' && (
          <Sheet key="queue" title="Queue" onClose={() => setOpen(null)}>
            <QueuePanel queue={queue} />
          </Sheet>
        )}
        {open === 'lyrics' && (
          <Sheet key="lyrics" title="Lyrics" onClose={() => setOpen(null)}>
            <PlainCopy>Lyrics unavailable for this track.</PlainCopy>
          </Sheet>
        )}
        {open === 'devices' && (
          <Sheet key="devices" title="Devices" onClose={() => setOpen(null)}>
            <PlainCopy>
              Coming soon — choose which device streams the audio.
            </PlainCopy>
          </Sheet>
        )}
        {open === 'room' && (
          <Sheet key="room" title={`Room · ${participants.length}`} onClose={() => setOpen(null)}>
            <RoomPanel participants={participants} youId={youId} />
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
}

function DockItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`label-caps min-w-[72px] rounded-full px-3.5 py-2 text-[10.5px] tracking-[0.14em] transition-colors duration-180 ${
        active ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/6 hover:text-white/90'
      }`}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="my-1 w-px self-stretch bg-white/8" />;
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ y: 48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 48, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[720px] rounded-t-3xl border-t border-x border-white/10 bg-[#0b0d11]/95 pb-6 pt-4 backdrop-blur-xl sm:bottom-24 sm:rounded-3xl sm:border"
      role="dialog"
      aria-label={title}
    >
      <div className="flex items-center justify-between px-5 pb-3">
        <h3 className="label-caps text-white/85">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors duration-180 hover:bg-white/10 hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M3 3 L9 9 M9 3 L3 9" />
          </svg>
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-5 pb-3">{children}</div>
    </motion.div>
  );
}

function PlainCopy({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 py-6 text-center text-[13px] leading-relaxed text-white/60">
      {children}
    </p>
  );
}

function QueuePanel({ queue }: { queue: CanonicalTrack[] }) {
  if (queue.length === 0) {
    return <PlainCopy>No tracks queued yet. Use the search above to add one.</PlainCopy>;
  }
  return (
    <ul className="flex flex-col gap-1 py-2">
      {queue.map((t, i) => (
        <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="mono w-5 text-right text-[10.5px] text-white/35">
            {i + 1}
          </span>
          {t.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.artworkUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md border border-white/10 object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-9 w-9 shrink-0 rounded-md border border-white/10 bg-white/[0.03]" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] text-white">{t.title}</span>
            <span className="truncate text-[11.5px] text-white/55">{t.artist}</span>
          </div>
        </li>
      ))}
      <li className="label-caps mt-1 px-2 text-white/30">
        reorder coming soon
      </li>
    </ul>
  );
}

function RoomPanel({
  participants,
  youId,
}: {
  participants: Participant[];
  youId?: string;
}) {
  return (
    <ul className="flex flex-col gap-1 py-2">
      {participants.map((p) => {
        const isYou = p.id === youId;
        const shortId = p.id.slice(0, 6);
        return (
          <li key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span
              className="block h-2.5 w-2.5 rounded-full"
              style={{
                background: `hsl(${p.hue}, 95%, 70%)`,
                boxShadow: `0 0 12px hsl(${p.hue}, 95%, 55%)`,
              }}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] text-white">
                {isYou ? 'you' : shortId}
              </span>
              <span className="truncate text-[11.5px] text-white/55">
                {p.provider ? providerDisplayName(p.provider) : 'picking…'}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
