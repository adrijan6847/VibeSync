'use client';

import { useEffect, useState } from 'react';
import { NowPlaying } from './NowPlaying';
import { ProviderPicker } from './ProviderPicker';
import { getConnectUI } from '@/music/adapters/connect';
import {
  providerDisplayName,
  readAndClearPendingProvider,
} from '@/music/adapters';
import type { MusicActions, MusicSnapshot } from '@/music/useMusicSession';
import type { ProviderId } from '@/music/types';

type Props = {
  music: MusicSnapshot & MusicActions;
  isHost: boolean;
};

/**
 * Orchestrates every participant's music journey: pick service →
 * connect → play in sync with the shared clock. Host additionally gets
 * catalog picker + transport controls; guests see a read-only NowPlaying.
 *
 * Each participant signs into their own service locally; the server
 * only holds the canonical track + wall-clock, so three users on
 * three different services all converge on the same moment.
 */
export function MusicPanel({ music, isHost }: Props) {
  const [pending, setPending] = useState<ProviderId | null>(null);
  const [switching, setSwitching] = useState(false);

  // Auto-resume a provider selection left behind by an OAuth redirect.
  // When an adapter starts an external sign-in (e.g. Spotify PKCE), it
  // stashes the provider id in sessionStorage and navigates away. On
  // return we pick it back up so the user doesn't land on the picker
  // again after already choosing.
  useEffect(() => {
    if (music.provider) return;
    const resume = readAndClearPendingProvider();
    if (!resume) return;
    setPending(resume);
    music.selectProvider(resume)
      .catch(() => {
        // ConnectUI will surface any error once it renders.
      })
      .finally(() => setPending(null));
    // Intentionally mount-only: this is the OAuth-return handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsConnect =
    music.provider !== null && !music.adapterReady;
  const ConnectUI = needsConnect ? getConnectUI(music.provider!) : null;

  if (!music.provider || pending || switching) {
    return (
      <ProviderPicker
        selected={pending ?? music.provider}
        onSelect={async (id) => {
          setSwitching(false);
          setPending(id);
          try {
            await music.selectProvider(id);
          } catch {
            // Error surfaced via music.adapterError + ConnectUI.
          } finally {
            setPending(null);
          }
        }}
      />
    );
  }

  if (needsConnect && ConnectUI) {
    return (
      <ConnectUI
        onAuthenticated={() => {
          music.selectProvider(music.provider!).catch(() => {});
        }}
        onCancel={() => {
          setSwitching(true);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ConnectedHeader
        providerId={music.provider}
        onSwitch={() => setSwitching(true)}
      />
      <NowPlaying
        nowPlaying={music.nowPlaying}
        isHost={isHost}
        onLoad={music.load}
        onSearch={music.search}
      />
    </div>
  );
}

function ConnectedHeader({
  providerId,
  onSwitch,
}: {
  providerId: ProviderId;
  onSwitch: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ice)] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--ice)]" />
        </span>
        <span className="label-caps text-[var(--fg-soft)]">
          {providerDisplayName(providerId).toLowerCase()} · ready
        </span>
      </div>
      <button
        onClick={onSwitch}
        className="label-caps text-[var(--fg-mute)] transition-colors duration-180 hover:text-[var(--fg-soft)]"
      >
        switch service
      </button>
    </div>
  );
}
