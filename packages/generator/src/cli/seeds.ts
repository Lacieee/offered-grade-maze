/**
 * Seed lists used by the CLI sweep and the golden test.
 */
import { DIFFICULTIES, formatSeed, type Difficulty } from '@ogm/shared';
import { GENERATOR_VERSION } from '../types.js';

/** Seed `<D>1-…` whose payload is the counter n (big-endian), as the sweep uses. */
export function counterSeed(d: Difficulty, n: number): string {
  const bytes = new Uint8Array(5);
  let x = n;
  for (let i = 4; i >= 0; i--) {
    bytes[i] = x % 256;
    x = Math.floor(x / 256);
  }
  return formatSeed(d, GENERATOR_VERSION, bytes);
}

/** Golden seeds: 10 per difficulty, fixed payloads. */
export function goldenSeeds(): string[] {
  const out: string[] = [];
  for (const d of DIFFICULTIES) {
    for (let i = 0; i < 10; i++) out.push(counterSeed(d, 1_000_003 * i + 17));
  }
  return out;
}
