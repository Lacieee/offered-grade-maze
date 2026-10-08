import { describe, expect, it } from 'vitest';
import {
  FLOOR_SIZE,
  PAINTING_H,
  PAINTING_W,
  floorPixels,
  mulberry32,
  paintingPixels,
  pixelHash,
  rgb,
} from './pixels.js';
import {
  acquireFloorTexture,
  floorTextureCount,
  paintingKey,
  paintingTexture,
  releaseFloorTexture,
} from './textures.js';

const PATTERNS = ['stripes', 'circles', 'waves', 'grid', 'checks'] as const;

describe('painting pixels (CP06 T3)', () => {
  it.each(PATTERNS)('%s: same params give the same bytes; seeds and colours change them', (p) => {
    const a = paintingPixels(p, 42, '#c0262d', '#f2f2f2');
    expect(a.width).toBe(PAINTING_W);
    expect(a.height).toBe(PAINTING_H);
    expect(pixelHash(paintingPixels(p, 42, '#c0262d', '#f2f2f2'))).toBe(pixelHash(a));
    expect(pixelHash(paintingPixels(p, 43, '#c0262d', '#f2f2f2'))).not.toBe(pixelHash(a));
    expect(pixelHash(paintingPixels(p, 42, '#2456b8', '#f2f2f2'))).not.toBe(pixelHash(a));
  });

  it('uses both colours and only opaque pixels', () => {
    const p = paintingPixels('checks', 1, '#ff0000', '#0000ff');
    const seen = new Set<string>();
    for (let i = 0; i < p.data.length; i += 4) {
      seen.add(`${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`);
      expect(p.data[i + 3]).toBe(255);
    }
    expect(seen).toEqual(new Set(['255,0,0', '0,0,255']));
  });

  it('distinct patterns look different', () => {
    const hashes = PATTERNS.map((p) => pixelHash(paintingPixels(p, 5, '#1f7a4a', '#e8a317')));
    expect(new Set(hashes).size).toBe(PATTERNS.length);
  });

  it('a texture flips rows so the top of the picture is up', () => {
    const t = paintingTexture('stripes', 3, '#000000', '#ffffff');
    const src = paintingPixels('stripes', 3, '#000000', '#ffffff');
    const data = t.image.data as Uint8Array;
    const last = (PAINTING_H - 1) * PAINTING_W * 4;
    expect([...data.subarray(last, last + 8)]).toEqual([...src.data.subarray(0, 8)]);
    expect(paintingKey('waves', 1, '#a', '#b')).toBe('painting:waves:1:#a:#b');
    t.dispose();
  });
});

describe('floor pixels (CP06 T3)', () => {
  it.each(['wood', 'tile', 'carpet'] as const)('%s: 512 × 512, tinted by the palette', (kind) => {
    const p = floorPixels(kind, '#8a6a4a');
    expect(p.width).toBe(FLOOR_SIZE);
    let r = 0;
    for (let i = 0; i < p.data.length; i += 4) r += p.data[i] ?? 0;
    // Average red stays near the tint's red channel (138).
    expect(r / (FLOOR_SIZE * FLOOR_SIZE)).toBeGreaterThan(100);
    expect(r / (FLOOR_SIZE * FLOOR_SIZE)).toBeLessThan(170);
    expect(pixelHash(floorPixels(kind, '#8a6a4a'))).toBe(pixelHash(p));
  });

  it('wood tiles seamlessly: plank rows wrap from bottom to top', () => {
    const p = floorPixels('wood', '#8a6a4a');
    // The first row is a plank seam and so is the row after the last one (row 0 again).
    const rowTone = (y: number): number => {
      let s = 0;
      for (let x = 0; x < FLOOR_SIZE; x++) s += p.data[(y * FLOOR_SIZE + x) * 4] ?? 0;
      return s / FLOOR_SIZE;
    };
    expect(rowTone(0)).toBeLessThan(rowTone(1));
    expect(rowTone(FLOOR_SIZE / 8)).toBeLessThan(rowTone(FLOOR_SIZE / 8 + 1));
  });

  it('floor textures are shared per kind and colour and freed by the last user', () => {
    const before = floorTextureCount();
    const a = acquireFloorTexture('tile', '#AABBCC');
    const b = acquireFloorTexture('tile', '#aabbcc');
    expect(b).toBe(a);
    expect(floorTextureCount()).toBe(before + 1);
    releaseFloorTexture(a);
    expect(floorTextureCount()).toBe(before + 1);
    releaseFloorTexture(b);
    expect(floorTextureCount()).toBe(before);
  });
});

describe('helpers', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(9);
    const b = mulberry32(9);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(rgb('#102030')).toEqual([16, 32, 48]);
  });
});
