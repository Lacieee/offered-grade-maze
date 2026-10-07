/**
 * Deterministic pseudo-random numbers for the generator.
 *
 * `cyrb128` hashes a string to a 128-bit state; `Sfc32` (Chris Doty-Humphrey's Small Fast
 * Counting generator) produces uint32 outputs from it. Only 32-bit integer operations are
 * used (`>>> 0`, `| 0`, `Math.imul`), so outputs are bit-identical on every JavaScript engine.
 *
 * Every subsystem draws from its own labelled stream via {@link rngFor}, so changing one
 * subsystem's rules never changes another's output for the same seed.
 */

/** 2³², the size of the uint32 output range. */
const U32_RANGE = 0x1_0000_0000;

/** Outputs discarded after seeding, to mix the initial state. */
const WARM_UP = 15;

/** Four uint32 words of PRNG state. */
export type Seed128 = [number, number, number, number];

/** Hashes a string to four uint32 words (cyrb128). Uses UTF-16 code units. */
export function cyrb128(str: string): Seed128 {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Deterministic uint32 generator (sfc32) with integer-only helpers. */
export class Sfc32 {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** Seeds the generator and discards the first 15 outputs. */
  constructor(seed: Seed128) {
    this.a = seed[0] >>> 0;
    this.b = seed[1] >>> 0;
    this.c = seed[2] >>> 0;
    this.d = seed[3] >>> 0;
    for (let i = 0; i < WARM_UP; i++) this.nextU32();
  }

  /** Next uniformly distributed uint32 in [0, 2³² − 1]. */
  nextU32(): number {
    const t0 = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const t = (t0 + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /**
   * Uniform integer in [min, max] (both inclusive), by rejection sampling: no modulo bias.
   *
   * @throws RangeError unless min and max are safe integers, min ≤ max and the range has at
   *   most 2³² values.
   */
  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError(`int(${min}, ${max}): bounds must be safe integers with min <= max`);
    }
    const range = max - min + 1;
    if (range > U32_RANGE) {
      throw new RangeError(`int(${min}, ${max}): range exceeds 2^32 values`);
    }
    if (range === U32_RANGE) return min + this.nextU32();
    // Reject the lowest (2³² mod range) values so every residue is equally likely.
    const threshold = (U32_RANGE - range) % range;
    let u = this.nextU32();
    while (u < threshold) u = this.nextU32();
    return min + (u % range);
  }

  /**
   * True with probability perMille / 1000.
   *
   * @throws RangeError unless perMille is an integer in [0, 1000].
   */
  chance(perMille: number): boolean {
    if (!Number.isInteger(perMille) || perMille < 0 || perMille > 1000) {
      throw new RangeError(`chance(${perMille}): expected an integer 0..1000`);
    }
    return this.int(0, 999) < perMille;
  }

  /**
   * A uniformly chosen element.
   *
   * @throws RangeError if `items` is empty.
   */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick() from an empty array');
    // Index is within bounds by construction.
    return items[this.int(0, items.length - 1)] as T;
  }

  /** A uniformly shuffled copy of `items` (Fisher–Yates). The input is not modified. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      // Both indices are within bounds by construction.
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /**
   * Index chosen with probability weights[i] / sum(weights).
   *
   * @throws RangeError unless every weight is a non-negative safe integer and the sum is in
   *   [1, 2³²].
   */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isSafeInteger(w) || w < 0) {
        throw new RangeError(`weighted(): weights must be non-negative integers, got ${w}`);
      }
      total += w;
    }
    if (total < 1 || total > U32_RANGE) {
      throw new RangeError(`weighted(): total weight must be 1..2^32, got ${total}`);
    }
    let r = this.int(0, total - 1);
    for (let i = 0; i < weights.length; i++) {
      // Index is within bounds by construction.
      const w = weights[i] as number;
      if (r < w) return i;
      r -= w;
    }
    /* v8 ignore next -- unreachable: r < total = sum(weights) */
    throw new Error('weighted(): unreachable');
  }
}

/**
 * The PRNG stream for one subsystem of one seed, seeded with
 * `cyrb128(`${canonicalSeed}|${label}`)`.
 *
 * Labels in use: `topology#<attempt>`, `room:<id>:layout`, `room:<id>:furnish`,
 * `room:<id>:palette`, `identity`.
 */
export function rngFor(canonicalSeed: string, label: string): Sfc32 {
  return new Sfc32(cyrb128(`${canonicalSeed}|${label}`));
}
