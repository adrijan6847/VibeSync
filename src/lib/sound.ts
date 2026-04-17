'use client';

/**
 * Tiny Web Audio synth. No asset loading; all generated in-browser.
 * Exposes: unlock() (call on first user interaction) and dropHit()
 * plus tick() for tap feedback.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  return ctx;
}

export async function unlock(): Promise<void> {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    try { await c.resume(); } catch {}
  }
  if (!unlocked) {
    // Silent blip to kick things off
    const osc = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    osc.connect(g).connect(master!);
    osc.frequency.value = 220;
    osc.start();
    osc.stop(c.currentTime + 0.02);
    unlocked = true;
  }
}

/** Light high-frequency click for tap feedback */
export function tick(): void {
  const c = getCtx();
  if (!c || !master) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(g).connect(master);
  osc.start(now);
  osc.stop(now + 0.1);
}

/** Schedule a "drop" bass hit at absolute audioContext time `atCtxTime` (seconds). */
export function scheduleDrop(atDelayMs: number): void {
  const c = getCtx();
  if (!c || !master) return;
  const when = c.currentTime + Math.max(0, atDelayMs) / 1000;

  // Sub bass sine sweep
  const sub = c.createOscillator();
  const subGain = c.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(160, when);
  sub.frequency.exponentialRampToValueAtTime(42, when + 0.18);
  sub.frequency.exponentialRampToValueAtTime(32, when + 1.6);
  subGain.gain.setValueAtTime(0.0001, when);
  subGain.gain.exponentialRampToValueAtTime(0.85, when + 0.015);
  subGain.gain.exponentialRampToValueAtTime(0.0001, when + 1.7);
  sub.connect(subGain).connect(master);
  sub.start(when);
  sub.stop(when + 1.8);

  // Noise burst for transient
  const bufferSize = Math.floor(c.sampleRate * 0.35);
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.5);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(2400, when);
  noiseFilter.frequency.exponentialRampToValueAtTime(400, when + 0.3);
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.25, when);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start(when);
  noise.stop(when + 0.4);

  // Metallic shimmer
  const shimmer = c.createOscillator();
  const shimmerGain = c.createGain();
  shimmer.type = 'sawtooth';
  shimmer.frequency.setValueAtTime(660, when);
  shimmer.frequency.exponentialRampToValueAtTime(220, when + 0.6);
  shimmerGain.gain.setValueAtTime(0.0001, when);
  shimmerGain.gain.exponentialRampToValueAtTime(0.1, when + 0.02);
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.8);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 400;
  shimmer.connect(hp).connect(shimmerGain).connect(master);
  shimmer.start(when);
  shimmer.stop(when + 0.9);
}

/** Anticipation "risers" in the last moments before drop */
export function scheduleRiser(durationMs: number): void {
  const c = getCtx();
  if (!c || !master) return;
  const when = c.currentTime;
  const end = when + durationMs / 1000;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, when);
  osc.frequency.exponentialRampToValueAtTime(880, end);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(300, when);
  f.frequency.exponentialRampToValueAtTime(3000, end);
  f.Q.value = 4;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.28, end - 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(f).connect(g).connect(master);
  osc.start(when);
  osc.stop(end + 0.02);
}
