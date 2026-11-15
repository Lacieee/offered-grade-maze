import { describe, expect, it } from 'vitest';
import { handLevel } from '../validate/__fixtures__/handLevel.js';
import { computeMetrics } from './metrics.js';

describe('computeMetrics', () => {
  // Spine r00 → r02 → r03 → r04 → r01 (goal), every spine door reciprocal, plus:
  //   r00.d1 sealed; r02.d2 self-link; r04.d2 long back link to r00 (depth 3 → 0);
  //   r01.d1 one-way into r03.d0 (which leads to r02, not back).
  const level = handLevel({
    r00: ['r02.d0', null],
    r02: ['r00.d0', 'r03.d0', 'r02.d0'],
    r03: ['r02.d1', 'r04.d0'],
    r04: ['r03.d1', 'r01.d0', 'r00.d0'],
    r01: ['r04.d1', 'r03.d0'],
  });
  const spine = ['r00', 'r02', 'r03', 'r04', 'r01'];
  const m = computeMetrics({ ...level, ...level.meta, spine });

  it('counts rooms, doors, links and specials', () => {
    expect(m).toMatchObject({
      rooms: 5,
      doors: 12,
      links: 11,
      shortest: 4,
      sealedDoors: 1,
      selfLinks: 1,
      longBackLinks: 1,
      twins: 0,
    });
  });

  it('asymmetric share: 3 of 11 links do not lead back (floor, per mille)', () => {
    expect(m.asymmetricShare).toBe(272);
  });

  it('misleading doors: spine-room doors that do not get closer to the goal', () => {
    // r02.d0, r02.d2 (self), r03.d0, r04.d0, r04.d2.
    expect(m.misleadingDoors).toBe(5);
  });

  it('counts twins; an unreachable goal gives shortest −1; no links gives share 0', () => {
    expect(
      computeMetrics({ ...level, ...level.meta, twinOf: { r03: 'r02', r02: null } }).twins,
    ).toBe(1);
    const lone = handLevel({ r00: [null], r01: [null] });
    const l = computeMetrics({ ...lone, ...lone.meta });
    expect([l.shortest, l.links, l.asymmetricShare]).toEqual([-1, 0, 0]);
  });
});
