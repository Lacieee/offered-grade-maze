import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { goldenSeeds } from './cli/seeds.js';
import { generateLevel } from './generate.js';
import { GENERATOR_VERSION } from './types.js';

interface Golden {
  generatorVersion: number;
  seeds: { seed: string; levelHash: string }[];
}

/**
 * Golden seeds (CP04 T8). `test/golden.json` is written by a separate process
 * (`pnpm gen golden --write`), so this test also proves cross-process determinism.
 * Until v1.0.0 the hashes may be regenerated in a PR that explains why; after v1.0.0 any
 * change to the output needs a GENERATOR_VERSION bump.
 */
const golden = JSON.parse(
  readFileSync(new URL('../test/golden.json', import.meta.url), 'utf8'),
) as Golden;

describe('golden seeds', () => {
  it('cover 10 seeds per difficulty for this generator version', () => {
    expect(golden.generatorVersion).toBe(GENERATOR_VERSION);
    expect(golden.seeds.map((s) => s.seed)).toEqual(goldenSeeds());
  });

  it.each(golden.seeds.map((s) => [s.seed, s.levelHash] as const))(
    '%s regenerates to its recorded hash, twice',
    (seed, hash) => {
      expect(generateLevel(seed).meta.levelHash).toBe(hash);
      expect(generateLevel(seed).meta.levelHash).toBe(hash);
    },
  );
});
