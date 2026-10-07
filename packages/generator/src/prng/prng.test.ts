import fc from 'fast-check';
import { describe, expect, inject, it } from 'vitest';
import snapshot from './__fixtures__/rngFor-M1-7K2Q-X9MP-test.json' with { type: 'json' };
import { Sfc32, cyrb128, rngFor } from './prng.js';

const isU32 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffff_ffff;
const anySeed = fc
  .tuple(fc.nat(), fc.nat(), fc.nat(), fc.nat())
  .map(([a, b, c, d]) => [a >>> 0, b >>> 0, c >>> 0, d >>> 0] as [number, number, number, number]);

describe('cyrb128', () => {
  it('matches the independent reference implementation', () => {
    expect(cyrb128(`${snapshot.seed}|${snapshot.label}`)).toEqual(snapshot.cyrb128);
    expect(cyrb128('')).toEqual([41608494, 3485963809, 1435736333, 1262568316]);
  });

  it('returns four uint32 words and separates nearby inputs', () => {
    const a = cyrb128('M1-7K2Q-X9MP|topology#0');
    const b = cyrb128('M1-7K2Q-X9MP|topology#1');
    expect(a.every(isU32)).toBe(true);
    expect(a).not.toEqual(b);
  });
});

describe('rngFor', () => {
  it("keeps the committed snapshot of the first 100 outputs of rngFor('M1-7K2Q-X9MP', 'test')", () => {
    const rng = rngFor('M1-7K2Q-X9MP', 'test');
    const outputs = Array.from({ length: 100 }, () => rng.nextU32());
    expect(outputs).toEqual(snapshot.outputs);
  });

  it('is reproducible and gives independent streams per label', () => {
    const first = rngFor('E1-0000-0000', 'identity');
    const again = rngFor('E1-0000-0000', 'identity');
    const other = rngFor('E1-0000-0000', 'room:r00:furnish');
    const a = Array.from({ length: 20 }, () => first.nextU32());
    expect(Array.from({ length: 20 }, () => again.nextU32())).toEqual(a);
    expect(Array.from({ length: 20 }, () => other.nextU32())).not.toEqual(a);
  });

  it('applies the 15-output warm-up', () => {
    const raw = new Sfc32(cyrb128('x|y'));
    const warmed = rngFor('x', 'y');
    // Both constructors warm up, so they agree.
    expect(warmed.nextU32()).toBe(raw.nextU32());
  });
});

describe('Sfc32.nextU32', () => {
  it('always returns a uint32', () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const rng = new Sfc32(seed);
        for (let i = 0; i < 50; i++) expect(isU32(rng.nextU32())).toBe(true);
      }),
      { numRuns: inject('propRuns') },
    );
  });
});

describe('Sfc32.int', () => {
  it('is uniform: int(0, 2) over 300 000 draws is within ±1 % per bucket', () => {
    const rng = rngFor('M1-7K2Q-X9MP', 'distribution');
    const counts = [0, 0, 0];
    const draws = 300_000;
    for (let i = 0; i < draws; i++) {
      const k = rng.int(0, 2);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const expected = draws / 3;
    for (const count of counts) {
      expect(Math.abs(count - expected) / expected).toBeLessThanOrEqual(0.01);
    }
  });

  it('stays within inclusive bounds', () => {
    fc.assert(
      fc.property(
        anySeed,
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (seed, min, span) => {
          const rng = new Sfc32(seed);
          for (let i = 0; i < 20; i++) {
            const v = rng.int(min, min + span);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThanOrEqual(min + span);
          }
        },
      ),
      { numRuns: inject('propRuns') },
    );
  });

  it('handles single-value and full 2^32 ranges', () => {
    const rng = rngFor('H1-ZZZZ-ZZZZ', 'edge');
    expect(rng.int(7, 7)).toBe(7);
    const v = rng.int(0, 0xffff_ffff);
    expect(isU32(v)).toBe(true);
  });

  it('rejects invalid bounds', () => {
    const rng = rngFor('H1-ZZZZ-ZZZZ', 'edge');
    expect(() => rng.int(2, 1)).toThrow(RangeError);
    expect(() => rng.int(0, 1.5)).toThrow(RangeError);
    expect(() => rng.int(0, 0x1_0000_0000)).toThrow(RangeError);
    expect(() => rng.int(Number.NaN, 1)).toThrow(RangeError);
  });
});

describe('Sfc32.chance', () => {
  it('is never true at 0 and always true at 1000', () => {
    const rng = rngFor('E1-0000-0000', 'chance');
    for (let i = 0; i < 1000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1000)).toBe(true);
    }
  });

  it('hits roughly perMille / 1000', () => {
    const rng = rngFor('E1-0000-0000', 'chance');
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (rng.chance(250)) hits++;
    expect(Math.abs(hits - 25_000)).toBeLessThan(750);
  });

  it('rejects non-integer or out-of-range probabilities', () => {
    const rng = rngFor('E1-0000-0000', 'chance');
    expect(() => rng.chance(-1)).toThrow(RangeError);
    expect(() => rng.chance(1001)).toThrow(RangeError);
    expect(() => rng.chance(0.5)).toThrow(RangeError);
  });
});

describe('Sfc32.pick', () => {
  it('returns an element of the array and reaches every element', () => {
    const rng = rngFor('M1-7K2Q-X9MP', 'pick');
    const items = ['a', 'b', 'c', 'd'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const v = rng.pick(items);
      expect(items).toContain(v);
      seen.add(v);
    }
    expect(seen.size).toBe(items.length);
  });

  it('rejects an empty array', () => {
    expect(() => rngFor('M1-7K2Q-X9MP', 'pick').pick([])).toThrow(RangeError);
  });
});

describe('Sfc32.shuffle', () => {
  it('returns a permutation and leaves the input untouched', () => {
    fc.assert(
      fc.property(anySeed, fc.array(fc.integer(), { maxLength: 40 }), (seed, items) => {
        const before = items.slice();
        const shuffled = new Sfc32(seed).shuffle(items);
        expect(items).toEqual(before);
        expect(shuffled).not.toBe(items);
        expect(shuffled.slice().sort((x, y) => x - y)).toEqual(before.sort((x, y) => x - y));
      }),
      { numRuns: inject('propRuns') },
    );
  });

  it('produces every permutation of three items', () => {
    const rng = rngFor('M1-7K2Q-X9MP', 'shuffle');
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) seen.add(rng.shuffle([1, 2, 3]).join(''));
    expect(seen.size).toBe(6);
  });
});

describe('Sfc32.weighted', () => {
  it('never picks a zero weight and follows the weights', () => {
    const rng = rngFor('M1-7K2Q-X9MP', 'weighted');
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 100_000; i++) {
      const k = rng.weighted([1, 0, 3, 6]);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const [c0 = 0, c1 = 0, c2 = 0, c3 = 0] = counts;
    expect(c1).toBe(0);
    expect(Math.abs(c0 - 10_000)).toBeLessThan(600);
    expect(Math.abs(c2 - 30_000)).toBeLessThan(900);
    expect(Math.abs(c3 - 60_000)).toBeLessThan(900);
  });

  it('rejects invalid weights', () => {
    const rng = rngFor('M1-7K2Q-X9MP', 'weighted');
    expect(() => rng.weighted([])).toThrow(RangeError);
    expect(() => rng.weighted([0, 0])).toThrow(RangeError);
    expect(() => rng.weighted([1, -1])).toThrow(RangeError);
    expect(() => rng.weighted([0.5, 1])).toThrow(RangeError);
    expect(() => rng.weighted([0xffff_ffff, 2])).toThrow(RangeError);
  });
});
