import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, inject, it } from 'vitest';
import { canonicalJson, levelHash } from './canonical.js';
import { sha256Hex, utf8 } from './sha256.js';

const nodeSha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
  ])('matches the NIST vector for %j', (input, hex) => {
    expect(sha256Hex(utf8(input))).toBe(hex);
  });

  it('matches the NIST vector for one million "a"', () => {
    expect(sha256Hex(utf8('a'.repeat(1_000_000)))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('matches Node crypto at every padding boundary (0–130 bytes)', () => {
    for (let n = 0; n <= 130; n++) {
      const s = 'x'.repeat(n);
      expect(sha256Hex(utf8(s)), `length ${n}`).toBe(nodeSha(s));
    }
  });

  it('property: matches Node crypto for any string, including non-ASCII', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 300 }), (s) => {
        expect(sha256Hex(utf8(s))).toBe(nodeSha(s));
      }),
      { numRuns: inject('propRuns') },
    );
  });
});

describe('utf8', () => {
  it('encodes 1- to 4-byte code points', () => {
    expect([...utf8('aé€\u{1f600}')]).toEqual([
      0x61, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
    ]);
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level, drops undefined and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: true, x: null }], c: 'é' }, u: undefined })).toBe(
      '{"a":{"c":"é","d":[3,{"x":null,"y":true}]},"b":1}',
    );
  });

  it('writes numbers like JSON.stringify and rejects non-finite ones', () => {
    expect(canonicalJson([0.25, -1.5, 3.141592653589793, -0])).toBe(
      '[0.25,-1.5,3.141592653589793,0]',
    );
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('levelHash covers only the player-visible fields', () => {
    const base = {
      seed: 'E1-0000-0000',
      difficulty: 'easy' as const,
      generatorVersion: 1 as const,
      startRoom: 'r00',
      goalRoom: 'r01',
      spawn: { x: 0, z: 0, yaw: 0 },
      rooms: [],
    };
    const h = levelHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(levelHash({ ...base, meta: { attempts: 9 } } as typeof base)).toBe(h);
    expect(levelHash({ ...base, goalRoom: 'r02' })).not.toBe(h);
  });
});
