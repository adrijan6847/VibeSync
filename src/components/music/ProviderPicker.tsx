'use client';

import { motion } from 'framer-motion';
import { getAdapter, listProviders } from '@/music/adapters';
import type { ProviderId } from '@/music/types';

type Props = {
  onSelect: (id: ProviderId) => void;
  selected: ProviderId | null;
};

export function ProviderPicker({ onSelect, selected }: Props) {
  const providers = listProviders();

  return (
    <div className="panel rounded-2xl p-6">
      <h2 className="text-[15px] font-medium tracking-[-0.01em] text-white">
        Pick your music service
      </h2>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--fg-soft)]">
        Connect your account to join the room in sync.
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        {providers.map((id, i) => {
          const displayName = getAdapter(id).displayName;
          const isPending = id === selected;
          return (
            <motion.button
              key={id}
              onClick={() => onSelect(id)}
              disabled={isPending}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.04 * i, ease: [0.16, 1, 0.3, 1] }}
              whileHover={isPending ? undefined : { x: 2 }}
              className={`group flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-[background,border-color] duration-200 ${
                isPending
                  ? 'cursor-wait border-[var(--stroke-strong)] bg-white/[0.04]'
                  : 'border-[var(--stroke)] hover:border-[var(--stroke-strong)] hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="block h-1.5 w-1.5 rounded-full bg-[var(--ice)]"
                  style={{ opacity: isPending ? 1 : 0.5 }}
                />
                <span className="text-[13.5px] text-white">
                  Connect {displayName}
                </span>
              </div>
              <span className="label-caps text-[var(--fg-mute)] transition-colors duration-200 group-hover:text-[var(--fg-soft)]">
                {isPending ? 'connecting…' : '→'}
              </span>
            </motion.button>
          );
        })}
        {providers.length === 0 && (
          <div className="label-caps text-[var(--fg-weak)]">
            no services available
          </div>
        )}
      </div>
    </div>
  );
}
