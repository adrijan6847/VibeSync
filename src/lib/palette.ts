/**
 * Album-art palette extraction.
 *
 * Loads the image via a CORS-permissive <img>, downsamples to 32×32, and
 * buckets pixels in HSL space (12 H × 3 S × 3 L = 108 buckets). Scores
 * each bucket by population × saturation, with heavy penalties for
 * near-gray and near-black/white (which are usually letterboxing or
 * vignettes, not "the vibe"). Picks three hue-diverse buckets, then
 * promotes the lightest of the candidates to the accent slot.
 *
 * Returns `null` on any CORS/decode failure — callers fall back to their
 * hard-coded defaults. Cache is module-level and keyed by URL, so track
 * swaps back to a previously-seen cover are O(1).
 */

export type Palette = {
  /** Dominant, saturated color. */
  primary: string;
  /** Supporting tone, hue-distinct from primary. */
  secondary: string;
  /** Lightest reasonable color (picked from the candidate pool). */
  accent: string;
};

const cache = new Map<string, Palette | null>();

export async function extractPalette(url: string): Promise<Palette | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  try {
    const img = await loadImage(url);
    const palette = computePalette(img);
    cache.set(url, palette);
    return palette;
  } catch {
    cache.set(url, null);
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

type Bucket = {
  count: number;
  sumR: number;
  sumG: number;
  sumB: number;
  sumS: number;
  sumL: number;
};

function computePalette(img: HTMLImageElement): Palette | null {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;

  const buckets = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const [h, s, l] = rgbToHsl(r, g, b);
    const hBin = Math.min(11, Math.floor(h * 12));
    const sBin = Math.min(2, Math.floor(s * 3));
    const lBin = Math.min(2, Math.floor(l * 3));
    const key = hBin * 9 + sBin * 3 + lBin;
    const prev = buckets.get(key);
    if (prev) {
      prev.count++;
      prev.sumR += r;
      prev.sumG += g;
      prev.sumB += b;
      prev.sumS += s;
      prev.sumL += l;
    } else {
      buckets.set(key, { count: 1, sumR: r, sumG: g, sumB: b, sumS: s, sumL: l });
    }
  }
  if (buckets.size === 0) return null;

  type Scored = { r: number; g: number; b: number; h: number; s: number; l: number; score: number };
  const scored: Scored[] = Array.from(buckets.values())
    .map((bk) => {
      const r = bk.sumR / bk.count;
      const g = bk.sumG / bk.count;
      const b = bk.sumB / bk.count;
      const s = bk.sumS / bk.count;
      const l = bk.sumL / bk.count;
      const [h] = rgbToHsl(r, g, b);
      const satPenalty = s < 0.15 ? 0.15 : 1;
      const edgePenalty = l < 0.1 || l > 0.92 ? 0.2 : 1;
      return { r, g, b, h, s, l, score: bk.count * (0.2 + s) * satPenalty * edgePenalty };
    })
    .sort((a, b) => b.score - a.score);

  // Pick three hue-diverse candidates — reject anything within 30° of an
  // already-chosen hue (wrapping through the color wheel).
  const picked: Scored[] = [];
  for (const c of scored) {
    if (picked.every((p) => hueDistance(p.h, c.h) > 30 / 360)) {
      picked.push(c);
      if (picked.length === 3) break;
    }
  }
  if (picked.length === 0) return null;
  while (picked.length < 3) picked.push(picked[picked.length - 1]);

  // Primary = highest score. Accent = lightest of the three (unless that's
  // already primary; then the next-lightest). Secondary = the remaining.
  const primary = picked[0];
  const byLight = [picked[1], picked[2]].sort((a, b) => b.l - a.l);
  const accent = byLight[0];
  const secondary = byLight[1];

  return {
    primary: toHex(primary.r, primary.g, primary.b),
    secondary: toHex(secondary.r, secondary.g, secondary.b),
    accent: toHex(accent.r, accent.g, accent.b),
  };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
