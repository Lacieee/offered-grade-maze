import { DIFFICULTIES, formatSeed } from '@ogm/shared';
import fc from 'fast-check';
import { describe, expect, inject, it } from 'vitest';
import { DIFFICULTY_TABLE } from '../difficulty/table.js';
import { topologyLabel } from '../generate.js';
import type { Sfc32 } from '../prng/index.js';
import { rngFor } from '../prng/index.js';
import { maxOffsetUnits, placeDoors, spacedEnough, validOffsets, wallUnits } from './doors.js';
import {
  AttemptFailed,
  Draft,
  SystematicChance,
  arrivalTier,
  pickArrival,
  pickTarget,
  type TDoor,
  type TRoom,
} from './model.js';
import { buildTopology } from './steps.js';

const rng = (label: string): Sfc32 => rngFor('E1-0000-0000', label);

function door(id: number, extra: Partial<TDoor> = {}): TDoor {
  return { id, wall: 'N', offset: 0, link: null, sealed: false, arrivals: 0, ...extra };
}

function room(idx: number, doors: TDoor[], layer = 0): TRoom {
  return {
    idx,
    type: 'study',
    layer,
    doorCount: doors.length,
    widthU: 16,
    depthU: 16,
    doors,
    twinOf: null,
    isOriginal: false,
  };
}

describe('door placement (integer units)', () => {
  it('converts the metre rules to units', () => {
    expect(wallUnits(24, 32, 'N')).toBe(24);
    expect(wallUnits(24, 32, 'E')).toBe(32);
    // 3 m wall: |offset| ≤ 1.5 − 0.5 − 0.5 = 0.5 m = 2 units.
    expect(maxOffsetUnits(12)).toBe(2);
    // 1.6 m = 6.4 units between centres.
    expect(spacedEnough(0, 6)).toBe(false);
    expect(spacedEnough(0, 7)).toBe(true);
    expect(spacedEnough(3, -4)).toBe(true);
  });

  it('lists only offsets that keep spacing from doors on the same wall', () => {
    const existing = [door(0, { wall: 'N', offset: 0 }), door(1, { wall: 'E', offset: 0 })];
    expect(validOffsets(24, 20, 'N', existing)).toEqual([-8, -7, 7, 8]);
    expect(validOffsets(20, 20, 'N', existing)).toEqual([]);
    expect(validOffsets(8, 20, 'N', [])).toEqual([0]);
  });

  it('property: placed doors satisfy corner margin and spacing, ids in order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 18 }),
        fc.integer({ min: 4, max: 18 }),
        fc.integer({ min: 1, max: 4 }),
        fc.string(),
        (hw, hd, count, label) => {
          const w = hw * 2;
          const d = hd * 2;
          let doors: TDoor[];
          try {
            doors = placeDoors(rng(label), w, d, count);
          } catch (e) {
            expect(e).toBeInstanceOf(AttemptFailed);
            return;
          }
          expect(doors.map((x) => x.id)).toEqual([...Array(count).keys()]);
          for (const a of doors) {
            expect(Math.abs(a.offset)).toBeLessThanOrEqual(maxOffsetUnits(wallUnits(w, d, a.wall)));
            for (const b of doors) {
              if (a !== b && a.wall === b.wall) expect(spacedEnough(a.offset, b.offset)).toBe(true);
            }
          }
        },
      ),
      { numRuns: inject('propRuns') },
    );
  });

  it('throws AttemptFailed when a room has no space left', () => {
    // A 2 × 2 m room fits one door per wall.
    expect(() => placeDoors(rng('full'), 8, 8, 5)).toThrow(AttemptFailed);
  });
});

describe('SystematicChance', () => {
  it('gives ⌊n·p⌋ or ⌈n·p⌉ yeses and the stated marginal probability', () => {
    for (let s = 0; s < 1000; s++) {
      const chance = new SystematicChance(rng(`s${s}`), 850);
      let yes = 0;
      for (let i = 0; i < 20; i++) if (chance.next()) yes++;
      expect(yes).toBe(17);
    }
    // Marginal probability of the first call over many starts ≈ 0.85.
    let first = 0;
    for (let s = 0; s < 2000; s++) if (new SystematicChance(rng(`f${s}`), 850).next()) first++;
    expect(first / 2000).toBeGreaterThan(0.82);
    expect(first / 2000).toBeLessThan(0.88);
  });
});

describe('arrival and target choice', () => {
  it('pickArrival prefers unused free doors, never sealed or excluded ones', () => {
    const r = room(0, [
      door(0, { arrivals: 1 }),
      door(1, { link: { room: 1, door: 0 } }),
      door(2),
      door(3, { sealed: true }),
    ]);
    expect(pickArrival(rng('a'), r, true).id).toBe(2);
    expect(pickArrival(rng('a'), r, true, 2).id).toBe(1);
    const sealedOnly = room(1, [door(0, { sealed: true })]);
    expect(() => pickArrival(rng('a'), sealedOnly, false)).toThrow(AttemptFailed);
  });

  it('pickTarget picks among rooms with the best arrival tier', () => {
    const best = room(0, [door(0)]);
    const used = room(1, [door(0, { arrivals: 1 })]);
    expect(arrivalTier(best, true)).toBe(0);
    expect(arrivalTier(used, true)).toBe(2);
    expect(arrivalTier(room(2, [door(0, { link: { room: 0, door: 0 } })]), true)).toBe(1);
    for (let i = 0; i < 10; i++) expect(pickTarget(rng(`t${i}`), [used, best], true)).toBe(best);
    expect(() => pickTarget(rng('x'), [room(3, [door(0, { sealed: true })])], true)).toThrow(
      AttemptFailed,
    );
  });

  it('Draft.link refuses used slots, sealed targets and self-doors', () => {
    const draft = new Draft();
    draft.rooms.push(room(0, [door(0), door(1, { sealed: true })]), room(1, [door(0)]));
    draft.link({ room: 0, door: 0 }, { room: 1, door: 0 });
    expect(() => {
      draft.link({ room: 0, door: 0 }, { room: 1, door: 0 });
    }).toThrow(AttemptFailed);
    expect(() => {
      draft.link({ room: 1, door: 0 }, { room: 0, door: 1 });
    }).toThrow(AttemptFailed);
    expect(() => {
      draft.link({ room: 1, door: 0 }, { room: 1, door: 0 });
    }).toThrow(AttemptFailed);
    expect(() => draft.room(5)).toThrow(AttemptFailed);
    expect(() => draft.door({ room: 0, door: 7 })).toThrow(AttemptFailed);
  });
});

describe.each(DIFFICULTIES)('buildTopology (%s)', (difficulty) => {
  const p = DIFFICULTY_TABLE[difficulty];

  it('exact special counts, PD9 sealing, layer capacity and no free slot left', () => {
    let built = 0;
    for (let n = 0; n < 300; n++) {
      const seed = formatSeed(difficulty, 1, Uint8Array.from([0, 0, 0, n >> 8, n & 255]));
      let draft: Draft;
      try {
        draft = buildTopology(difficulty, (s) => rngFor(seed, topologyLabel(1, s)));
      } catch (e) {
        expect(e).toBeInstanceOf(AttemptFailed);
        continue;
      }
      built++;
      const L = draft.L;
      let sealed = 0;
      let self = 0;
      let longBack = 0;
      for (const r of draft.rooms) {
        for (const d of r.doors) {
          if (d.sealed) {
            sealed++;
            expect(d.arrivals).toBe(0); // PD9
            expect(d.link).toBeNull();
            continue;
          }
          expect(d.link).not.toBeNull(); // step 10 fills every slot
          if (d.link === null) continue;
          if (d.link.room === r.idx) self++;
          if (draft.room(d.link.room).layer <= r.layer - 3) longBack++;
        }
      }
      expect(sealed).toBeGreaterThanOrEqual(p.sealedDoors.min);
      expect(sealed).toBeLessThanOrEqual(p.sealedDoors.max);
      expect(self).toBeGreaterThanOrEqual(p.selfLinks.min);
      expect(self).toBeLessThanOrEqual(p.selfLinks.max);
      expect(longBack).toBeGreaterThanOrEqual(p.longBackLinks.min);
      expect(longBack).toBeLessThanOrEqual(p.longBackLinks.min + 3);
      expect(draft.rooms.filter((r) => r.twinOf !== null)).toHaveLength(draft.twins);
      for (let k = 0; k < L; k++) {
        const slots = draft.layer(k).reduce((s, r) => s + r.doors.length, 0);
        expect(slots).toBeGreaterThanOrEqual(draft.layer(k + 1).length + draft.layer(k).length);
      }
      expect(draft.layer(0).map((r) => r.idx)).toEqual([0]);
      expect(draft.layer(L).map((r) => r.idx)).toEqual([L]);
      for (const r of draft.rooms) {
        expect(r.doors.length).toBeGreaterThanOrEqual(1);
        expect(r.doors.length).toBeLessThanOrEqual(4);
      }
    }
    expect(built).toBeGreaterThan(280);
  });
});
