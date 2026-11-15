import fc from 'fast-check';
import { describe, expect, inject, it } from 'vitest';
import {
  CANONICAL_SEED_PATTERN,
  DIFFICULTIES,
  SEED_ALPHABET,
  decodePayload,
  difficultyLetter,
  encodePayload,
  formatSeed,
  parseSeed,
  type SeedParseError,
} from './seed.js';

const bytes5 = fc.uint8Array({ minLength: 5, maxLength: 5 });
const difficulty = fc.constantFrom(...DIFFICULTIES);

function expectError(input: string, error: SeedParseError): void {
  expect(parseSeed(input)).toEqual({ ok: false, error });
}

describe('parseSeed', () => {
  it('parses the canonical example', () => {
    expect(parseSeed('M1-7K2Q-X9MP')).toEqual({
      ok: true,
      seed: { difficulty: 'medium', version: 1, payload: '7K2QX9MP', canonical: 'M1-7K2Q-X9MP' },
    });
  });

  it.each(['m1 7k2q x9mp', 'M17K2QX9MP', 'M1-7K2Q-X9MP', '  m1_7k2q-x9mp  ', 'M 1 - 7K2Q X9MP'])(
    'accepts %j as the same canonical seed',
    (input) => {
      const result = parseSeed(input);
      expect(result.ok && result.seed.canonical).toBe('M1-7K2Q-X9MP');
    },
  );

  it('normalises O to 0 and I/L to 1 in the payload', () => {
    const result = parseSeed('E1-OILo-ilOO');
    expect(result.ok && result.seed.payload).toBe('01101100');
    expect(result.ok && result.seed.canonical).toBe('E1-0110-1100');
  });

  it('decodes every difficulty letter', () => {
    expect(parseSeed('E1-0000-0000')).toMatchObject({ seed: { difficulty: 'easy' } });
    expect(parseSeed('M1-0000-0000')).toMatchObject({ seed: { difficulty: 'medium' } });
    expect(parseSeed('H1-ZZZZ-ZZZZ')).toMatchObject({ seed: { difficulty: 'hard' } });
  });

  it('rejects empty input', () => {
    expectError('', 'empty');
    expectError('  - _ ', 'empty');
  });

  it('rejects the wrong length', () => {
    expectError('M1-7K2Q-X9M', 'length');
    expectError('M1-7K2Q-X9MPP', 'length');
    expectError('M', 'length');
  });

  it('rejects an unknown difficulty letter', () => {
    expectError('X1-7K2Q-X9MP', 'difficulty');
    expectError('11-7K2Q-X9MP', 'difficulty');
  });

  it('rejects a malformed version', () => {
    expectError('MA-7K2Q-X9MP', 'version');
    expectError('M0-7K2Q-X9MP', 'version');
  });

  it('rejects unsupported versions', () => {
    expectError('M2-7K2Q-X9MP', 'unsupported_version');
    expectError('E9-7K2Q-X9MP', 'unsupported_version');
  });

  it('rejects U and other characters outside the alphabet', () => {
    expectError('M1-7K2Q-X9MU', 'character');
    expectError('M1-7K2Q-X9M!', 'character');
    expectError('M1-7K2Q-X9MÁ', 'character');
  });
});

describe('formatSeed', () => {
  it('formats known payloads', () => {
    expect(formatSeed('easy', 1, new Uint8Array([0, 0, 0, 0, 0]))).toBe('E1-0000-0000');
    expect(formatSeed('hard', 1, new Uint8Array([255, 255, 255, 255, 255]))).toBe('H1-ZZZZ-ZZZZ');
    // 0x0000000001 → last character '1'; 0x8000000000 → first character 'G' (16).
    expect(formatSeed('medium', 1, new Uint8Array([0, 0, 0, 0, 1]))).toBe('M1-0000-0001');
    expect(formatSeed('medium', 1, new Uint8Array([0x80, 0, 0, 0, 0]))).toBe('M1-G000-0000');
  });

  it('rejects bad versions and payload lengths', () => {
    const ok = new Uint8Array(5);
    expect(() => formatSeed('easy', 0, ok)).toThrow(RangeError);
    expect(() => formatSeed('easy', 10, ok)).toThrow(RangeError);
    expect(() => formatSeed('easy', 1.5, ok)).toThrow(RangeError);
    expect(() => formatSeed('easy', 1, new Uint8Array(4))).toThrow(RangeError);
    expect(() => formatSeed('easy', 1, new Uint8Array(6))).toThrow(RangeError);
  });

  it('round-trips 10 000 random payloads through parseSeed', () => {
    fc.assert(
      fc.property(difficulty, bytes5, (d, bytes) => {
        const code = formatSeed(d, 1, bytes);
        expect(code).toMatch(CANONICAL_SEED_PATTERN);
        const parsed = parseSeed(code);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.seed.canonical).toBe(code);
        expect(parsed.seed.difficulty).toBe(d);
        expect(parsed.seed.version).toBe(1);
        expect(decodePayload(parsed.seed.payload)).toEqual(bytes);
      }),
      { numRuns: 10_000 },
    );
  });

  it('parses lower-case, undashed and spaced variants to the same seed', () => {
    fc.assert(
      fc.property(difficulty, bytes5, (d, bytes) => {
        const code = formatSeed(d, 1, bytes);
        const variants = [code.toLowerCase(), code.replace(/-/g, ''), code.replace(/-/g, ' ')];
        for (const v of variants) {
          const parsed = parseSeed(v);
          expect(parsed.ok && parsed.seed.canonical).toBe(code);
        }
      }),
      { numRuns: inject('propRuns') },
    );
  });
});

describe('payload codec', () => {
  it('decodes exactly the bytes it encoded', () => {
    fc.assert(
      fc.property(bytes5, (bytes) => {
        expect(decodePayload(encodePayload(bytes))).toEqual(bytes);
      }),
      { numRuns: inject('propRuns') },
    );
  });

  it('encodes every base32 character', () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(...Array.from(SEED_ALPHABET)),
          minLength: 8,
          maxLength: 8,
        }),
        (s) => {
          expect(encodePayload(decodePayload(s))).toBe(s);
        },
      ),
      { numRuns: inject('propRuns') },
    );
  });

  it('rejects malformed payloads', () => {
    expect(() => decodePayload('ABC')).toThrow(RangeError);
    expect(() => decodePayload('0000000U')).toThrow(RangeError);
  });
});

describe('difficultyLetter', () => {
  it('maps each difficulty', () => {
    expect(DIFFICULTIES.map(difficultyLetter)).toEqual(['E', 'M', 'H']);
  });
});
