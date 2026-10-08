/**
 * The generator property test (CP04 acceptance, extended by CP05): one file per difficulty,
 * so Vitest runs the three in parallel workers.
 */
import { formatSeed, type Difficulty } from '@ogm/shared';
import fc from 'fast-check';
import { expect, inject, it } from 'vitest';
import { generateLevel } from '../generate.js';
import { checkDepthInvariants } from '../validate/invariants.js';
import { validateLevel } from '../validate/validate.js';

/** Registers the property test for one difficulty. */
export function propertySuite(difficulty: Difficulty): void {
  it(`${difficulty}: invariants 1–3 hold on the assigned depths and V1–V11 pass`, () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 5, maxLength: 5 }), (bytes) => {
        const level = generateLevel(formatSeed(difficulty, 1, bytes));
        expect(checkDepthInvariants(level)).toEqual([]);
        expect(validateLevel(level)).toEqual([]);
      }),
      { numRuns: inject('propRuns') },
    );
  }, 600_000);
}
