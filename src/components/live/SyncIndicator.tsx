'use client';

type SyncIndicatorProps = {
  driftMs: number;
};

/**
 * Status-only. Green ≤ 600 ms, amber ≤ 2500 ms, red above. Updates come
 * at ≤ 2 Hz from useMusicSession's drift-correction interval — this is
 * not a VU meter.
 */
export function SyncIndicator({ driftMs }: SyncIndicatorProps) {
  const tone = driftMs <= 600 ? 'ok' : driftMs <= 2500 ? 'warn' : 'bad';
  const color =
    tone === 'ok' ? '#22c55e' : tone === 'warn' ? '#eab308' : '#ef4444';
  const label = tone === 'ok' ? 'SYNCED' : tone === 'warn' ? 'DRIFTING' : 'OUT OF SYNC';

  return (
    <div
      role="status"
      className="label-caps flex items-center justify-center gap-1.5"
      style={{ color }}
    >
      <Bars color={color} />
      <span className="text-[10.5px] tracking-[0.2em]">{label}</span>
    </div>
  );
}

function Bars({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill={color} aria-hidden>
      <rect x="0" y="6" width="2" height="4" rx="0.5" />
      <rect x="4" y="3" width="2" height="7" rx="0.5" />
      <rect x="8" y="0" width="2" height="10" rx="0.5" />
    </svg>
  );
}
