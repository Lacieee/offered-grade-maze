import { RoomTypeSchema } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { rngFor } from '../prng/index.js';
import { ACCENTS, PALETTES, SIGNATURE_COLORS } from './palettes.js';
import { SignatureSource, signatureKey } from './signature.js';

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const HEX = /^#[0-9a-f]{6}$/;

describe('palettes (CP05 T2)', () => {
  it.each(RoomTypeSchema.options)('%s: at least 4 palettes with valid colours', (type) => {
    expect(PALETTES[type].length).toBeGreaterThanOrEqual(4);
    for (const p of PALETTES[type]) {
      for (const c of [p.wall, p.floor, p.trim, p.ceiling]) expect(c).toMatch(HEX);
    }
    for (const c of ACCENTS[type]) expect(c).toMatch(HEX);
  });

  it.each(RoomTypeSchema.options)(
    '%s: any two palettes have walls ≥ 40 apart in some RGB channel',
    (type) => {
      const list = PALETTES[type];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = rgb(list[i]?.wall ?? '');
          const b = rgb(list[j]?.wall ?? '');
          const most = Math.max(...a.map((v, k) => Math.abs(v - (b[k] ?? 0))));
          expect(most, `${type} ${i} vs ${j}`).toBeGreaterThanOrEqual(40);
        }
      }
    },
  );

  it('signature colours are distinct', () => {
    expect(new Set(SIGNATURE_COLORS).size).toBe(SIGNATURE_COLORS.length);
  });
});

describe('SignatureSource', () => {
  it('never repeats a (prefab, colours, params) triple', () => {
    const source = new SignatureSource(rngFor('H1-0000-0000', 'identity'));
    const keys = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const item = source.next(new Set());
      expect(item).not.toBeNull();
      if (item === null) return;
      expect(item.signature).toBe(true);
      const key = signatureKey(item);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      if (item.prefab === 'sig_painting') expect(item.params).toBeDefined();
    }
  });

  it('respects exclusions and returns null once every prefab is excluded', () => {
    const source = new SignatureSource(rngFor('H1-0000-0000', 'identity'));
    const exclude = new Set([
      'sig_painting',
      'sig_grandfather_clock',
      'sig_red_armchair',
      'sig_aquarium',
      'sig_giant_plant',
    ] as const);
    for (let i = 0; i < 20; i++) expect(source.next(exclude)?.prefab).toBe('sig_large_globe');
    expect(source.next(new Set([...exclude, 'sig_large_globe']))).toBeNull();
  });
});
