/**
 * Procedural pixel buffers for paintings and floors (CP06 T3). Pure functions over RGBA
 * byte arrays: no canvas, so the same parameters give the same bytes in every browser and in
 * Node tests (ADR-0007).
 */

/** An RGBA image. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Small seeded PRNG (mulberry32): uniform floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `#rrggbb` → [r, g, b]. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function image(width: number, height: number): Pixels {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function put(p: Pixels, x: number, y: number, c: readonly number[]): void {
  const i = (y * p.width + x) * 4;
  p.data[i] = c[0] ?? 0;
  p.data[i + 1] = c[1] ?? 0;
  p.data[i + 2] = c[2] ?? 0;
  p.data[i + 3] = 255;
}

/** Painting patterns (CP05 `params.pattern`). */
export type Pattern = 'stripes' | 'circles' | 'waves' | 'grid' | 'checks';

/** Painting canvas size (CP06 T3). */
export const PAINTING_W = 256;
export const PAINTING_H = 192;

/**
 * A painting: background `secondary`, figures in `primary`, layout from `seed`. Unknown
 * patterns fall back to stripes.
 */
export function paintingPixels(
  pattern: string,
  seed: number,
  primary: string,
  secondary: string,
): Pixels {
  const p = image(PAINTING_W, PAINTING_H);
  const rand = mulberry32(seed * 2654435761 + pattern.length);
  const fg = rgb(primary);
  const bg = rgb(secondary);
  // A third tone between the two keeps the pictures from looking flat.
  const mid = fg.map((v, i) => Math.round((v + (bg[i] ?? 0)) / 2));
  const W = PAINTING_W;
  const H = PAINTING_H;

  const circles = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => ({
    x: rand() * W,
    y: rand() * H,
    r: 18 + rand() * 50,
    tone: rand() < 0.35 ? mid : fg,
  }));
  const stripeW = 10 + Math.floor(rand() * 22);
  const stripeAngle = rand() < 0.5 ? 0 : 1;
  const waveAmp = 8 + rand() * 18;
  const waveLen = 40 + rand() * 60;
  const waveGap = 22 + Math.floor(rand() * 16);
  const phase = rand() * Math.PI * 2;
  const cell = 16 + Math.floor(rand() * 4) * 8;
  const line = 3 + Math.floor(rand() * 4);
  const accentCell = Math.floor(rand() * 12);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: readonly number[] = bg;
      switch (pattern) {
        case 'circles': {
          for (const k of circles) {
            const dx = x - k.x;
            const dy = y - k.y;
            if (dx * dx + dy * dy < k.r * k.r) c = k.tone;
          }
          break;
        }
        case 'waves': {
          const v = y + Math.sin((x / waveLen) * Math.PI * 2 + phase) * waveAmp;
          const band = Math.floor(v / waveGap);
          c = band % 3 === 0 ? fg : band % 3 === 1 ? bg : mid;
          break;
        }
        case 'grid': {
          const gx = x % cell < line;
          const gy = y % cell < line;
          const index = Math.floor(x / cell) + Math.floor(y / cell) * 3;
          c = gx || gy ? fg : index % 12 === accentCell ? mid : bg;
          break;
        }
        case 'checks': {
          const odd = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 1;
          c = odd ? fg : bg;
          break;
        }
        default: {
          const t = stripeAngle === 0 ? x : x + y;
          const band = Math.floor(t / stripeW);
          c = band % 2 === 0 ? fg : band % 5 === 1 ? mid : bg;
        }
      }
      put(p, x, y, c);
    }
  }
  return p;
}

/** Floor kinds (`RoomDTO.floor`). */
export type FloorKind = 'wood' | 'tile' | 'carpet';

/** Floor texture size (CP06 T3): 512 × 512, one repeat per metre. */
export const FLOOR_SIZE = 512;

/**
 * A tileable floor texture tinted by the palette's floor colour: wood planks with tone
 * variation, tiles with grout lines, or fine carpet noise.
 */
export function floorPixels(kind: FloorKind, tint: string): Pixels {
  const N = FLOOR_SIZE;
  const p = image(N, N);
  const base = rgb(tint);
  const rand = mulberry32(kind.length * 7919 + (base[0] << 16) + (base[1] << 8) + base[2]);
  const scaled = (k: number): number[] =>
    base.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  if (kind === 'wood') {
    // 8 planks per metre (12.5 cm), staggered joints, each plank its own tone.
    const planks = 8;
    const ph = N / planks;
    const tones = Array.from({ length: planks * 2 }, () => 0.86 + rand() * 0.24);
    const joints = Array.from({ length: planks }, () => Math.floor(rand() * N));
    for (let y = 0; y < N; y++) {
      const row = Math.floor(y / ph);
      for (let x = 0; x < N; x++) {
        const second = (x - (joints[row] ?? 0) + N) % N < N / 2 ? 0 : 1;
        let k = tones[row * 2 + second] ?? 1;
        // Grain: a slow ripple along the plank.
        k *= 1 + 0.035 * Math.sin((x / N) * Math.PI * 6 + row * 1.7);
        const seam = y % ph === 0 || (x - (joints[row] ?? 0) + N) % (N / 2) === 0;
        put(p, x, y, scaled(seam ? k * 0.7 : k));
      }
    }
  } else if (kind === 'tile') {
    // 4 tiles per metre (25 cm) with 2-pixel grout and a slight tone per tile.
    const tile = N / 4;
    const tones = Array.from({ length: 16 }, () => 0.95 + rand() * 0.1);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const grout = x % tile < 2 || y % tile < 2;
        const k = grout ? 0.72 : (tones[Math.floor(x / tile) + Math.floor(y / tile) * 4] ?? 1);
        put(p, x, y, scaled(grout ? 1.25 * k : k));
      }
    }
  } else {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) put(p, x, y, scaled(0.92 + rand() * 0.16));
    }
  }
  return p;
}

/** FNV-1a hash of a pixel buffer (tests and the Playwright painting check). */
export function pixelHash(p: Pixels): string {
  let h = 0x811c9dc5;
  for (const b of p.data) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
