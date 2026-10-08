import {
  DIFFICULTIES,
  RoomDTOSchema,
  SpawnSchema,
  formatSeed,
  shortestPath,
  type Difficulty,
} from '@ogm/shared';
import fc from 'fast-check';
import { describe, expect, inject, it } from 'vitest';
import { DIFFICULTY_TABLE } from './difficulty/table.js';
import { generateLevel, runAttempt, topologyLabel } from './generate.js';
import { GENERATOR_VERSION, GenerationError, InvalidSeedError, MAX_ATTEMPTS } from './types.js';
import { checkDepthInvariants } from './validate/invariants.js';
import { validateLevel } from './validate/validate.js';

const PROP_TIMEOUT = 300_000;
const payload = fc.uint8Array({ minLength: 5, maxLength: 5 });

/** Seed `<D>1-…` from a counter, as the CLI sweep does. */
function counterSeed(d: Difficulty, n: number): string {
  const bytes = new Uint8Array(5);
  let x = n;
  for (let i = 4; i >= 0; i--) {
    bytes[i] = x % 256;
    x = Math.floor(x / 256);
  }
  return formatSeed(d, 1, bytes);
}

describe.each(DIFFICULTIES)('generateLevel (%s)', (difficulty) => {
  it(
    'property: invariants 1–3 hold on the assigned depths and V1–V6, V9, V10 pass',
    () => {
      fc.assert(
        fc.property(payload, (bytes) => {
          const level = generateLevel(formatSeed(difficulty, 1, bytes));
          expect(checkDepthInvariants(level)).toEqual([]);
          expect(validateLevel(level)).toEqual([]);
        }),
        { numRuns: inject('propRuns') },
      );
    },
    PROP_TIMEOUT,
  );

  it('produces schema-valid DTOs and the documented level shape', () => {
    const level = generateLevel(counterSeed(difficulty, 7));
    const p = DIFFICULTY_TABLE[difficulty];
    expect(level.generatorVersion).toBe(GENERATOR_VERSION);
    expect(level.difficulty).toBe(difficulty);
    for (const room of level.rooms) {
      expect(RoomDTOSchema.parse(room)).toEqual(room);
      expect(room.furniture).toEqual([]);
      expect(room.lights).toEqual([
        { kind: 'ceiling', x: 0, y: 2.6, z: 0, color: '#fff2dd', intensity: 1 },
      ]);
      expect(room.doors.map((d) => d.id)).toEqual(room.doors.map((_, i) => `d${i}`));
      expect(room.label).toBe(`room.${room.type}`);
    }
    expect(SpawnSchema.parse(level.spawn)).toEqual(level.spawn);
    expect(level.rooms.map((r) => r.id)).toEqual(
      level.rooms.map((_, i) => `r${String(i).padStart(2, '0')}`),
    );
    expect(level.rooms.find((r) => r.id === level.goalRoom)?.goal).toEqual({ x: 0, y: 1.2, z: 0 });
    const L = level.meta.spine.length - 1;
    expect(L).toBeGreaterThanOrEqual(p.solutionLength.min);
    expect(L).toBeLessThanOrEqual(p.solutionLength.max);
    expect(level.meta.spine[0]).toBe(level.startRoom);
    expect(level.meta.spine[L]).toBe(level.goalRoom);
    expect(level.meta.metrics.shortest).toBe(L);
    // The spine has exactly L doors and no route is shorter.
    expect(shortestPath(level.rooms, level.startRoom, level.goalRoom)).toHaveLength(L + 1);
  });

  it('every type appears; the start is a living room or hallway; twins copy their original', () => {
    for (let n = 0; n < 50; n++) {
      const level = generateLevel(counterSeed(difficulty, n));
      const types = new Set(level.rooms.map((r) => r.type));
      expect(types.size).toBe(6);
      const start = level.rooms.find((r) => r.id === level.startRoom);
      expect(['living', 'hallway']).toContain(start?.type);
      for (const [id, of] of Object.entries(level.meta.twinOf)) {
        if (of === null) continue;
        const twin = level.rooms.find((r) => r.id === id);
        const original = level.rooms.find((r) => r.id === of);
        expect(level.meta.spine).not.toContain(id);
        expect(level.meta.spine).toContain(of);
        expect(of).not.toBe(level.goalRoom);
        expect(twin?.type).toBe(original?.type);
        expect([twin?.width, twin?.depth]).toEqual([original?.width, original?.depth]);
        expect(twin?.doors.map((d) => [d.wall, d.offset])).toEqual(
          original?.doors.map((d) => [d.wall, d.offset]),
        );
      }
    }
  });

  it('spawn: start-room centre, facing the wall of door d0', () => {
    const facing = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
    for (let n = 0; n < 20; n++) {
      const level = generateLevel(counterSeed(difficulty, n));
      const d0 = level.rooms.find((r) => r.id === level.startRoom)?.doors[0];
      expect(d0).toBeDefined();
      if (d0 !== undefined) expect(level.spawn).toEqual({ x: 0, z: 0, yaw: facing[d0.wall] });
    }
  });
});

describe('determinism (V10)', () => {
  it('the same seed twice gives the same level and hash', () => {
    for (const d of DIFFICULTIES) {
      const a = generateLevel(counterSeed(d, 42));
      const b = generateLevel(counterSeed(d, 42));
      expect(b).toEqual(a);
      expect(b.meta.levelHash).toBe(a.meta.levelHash);
    }
  });

  it('typed seeds generate the canonical seed', () => {
    const level = generateLevel(' m1 7k2q x9mp ');
    expect(level.seed).toBe('M1-7K2Q-X9MP');
    expect(level.meta.levelHash).toBe(generateLevel('M1-7K2Q-X9MP').meta.levelHash);
  });

  it('attempt labels are topology#<attempt>/<step>', () => {
    expect(topologyLabel(3, 12)).toBe('topology#3/12');
  });

  it('a later attempt gives a different house', () => {
    const a = runAttempt('M1-7K2Q-X9MP', 'medium', 1);
    const b = runAttempt('M1-7K2Q-X9MP', 'medium', 2);
    expect(a.level?.meta.levelHash).not.toBe(b.level?.meta.levelHash);
  });
});

describe('room ids are a permutation', () => {
  it('the start room is r00 in roughly 1/N of 1 000 seeds', () => {
    let startIsR00 = 0;
    let expected = 0;
    for (let n = 0; n < 1000; n++) {
      const level = generateLevel(counterSeed('easy', n));
      if (level.startRoom === 'r00') startIsR00++;
      expected += 1 / level.rooms.length;
    }
    // Expected ≈ 111; binomial σ ≈ 10. Allow ±4σ.
    expect(Math.abs(startIsR00 - expected)).toBeLessThan(40);
  });
});

describe('retries and errors', () => {
  it('reports every attempt; retried levels record their attempt count', () => {
    let found = false;
    for (let n = 0; n < 400 && !found; n++) {
      const reports: { attempt: number; ok: boolean; reason: string }[] = [];
      const level = generateLevel(counterSeed('easy', n), { onAttempt: (r) => reports.push(r) });
      expect(reports.at(-1)).toEqual({ attempt: level.meta.attempts, ok: true, reason: '' });
      expect(reports).toHaveLength(level.meta.attempts);
      if (level.meta.attempts > 1) {
        found = true;
        expect(reports[0]?.ok).toBe(false);
        expect(reports[0]?.reason).toMatch(/^V\d+: /);
      }
    }
    expect(found).toBe(true);
  });

  it('rejects malformed seeds and unsupported versions', () => {
    expect(() => generateLevel('X1-0000-0000')).toThrow(InvalidSeedError);
    expect(() => generateLevel('M2-0000-0000')).toThrow(/unsupported_version/);
  });

  it('GenerationError lists the failures', () => {
    const e = new GenerationError(
      'H1-0000-0000',
      Array.from({ length: MAX_ATTEMPTS }, () => 'x'),
    );
    expect(e.message).toBe('Could not generate a valid level for H1-0000-0000 in 64 attempts');
    expect(e.name).toBe('GenerationError');
  });
});
