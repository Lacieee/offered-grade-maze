import { describe, expect, it } from 'vitest';
import { generateLevel } from '../generate.js';
import type { CheckId, Level } from '../types.js';
import { finish, handLevel } from './__fixtures__/handLevel.js';
import { checkDepthInvariants } from './invariants.js';
import { validateLevel } from './validate.js';

const checks = (level: Level): CheckId[] => [...new Set(validateLevel(level).map((i) => i.check))];

/** A start → goal chain of length 4 with reciprocal doors: valid apart from the metrics. */
const chain = {
  r00: ['r02.d0'],
  r02: ['r00.d0', 'r03.d0'],
  r03: ['r02.d1', 'r04.d0'],
  r04: ['r03.d1', 'r01.d0'],
  r01: ['r04.d1'],
};

describe('validateLevel — hand-built levels (negative tests)', () => {
  it('baseline chain passes every graph and structure check', () => {
    expect(checks(handLevel(chain))).toEqual(['V9']); // too few rooms, no misleading doors
  });

  it('V1: goal unreachable', () => {
    const level = handLevel({ r00: ['r02.d0'], r02: ['r00.d0'], r01: ['r00.d0'] });
    expect(checks(level)).toContain('V1');
  });

  it('V2: reachable sink cycle without exit', () => {
    const level = handLevel({
      ...chain,
      r00: ['r02.d0', 'r05.d0'],
      r05: ['r06.d0'],
      r06: ['r05.d0'],
    });
    const issues = validateLevel(level).filter((i) => i.check === 'V2');
    expect(issues.map((i) => i.room).sort()).toEqual(['r05', 'r06']);
  });

  it('V2: one-way door into a dead end (a room whose doors only lead back into itself)', () => {
    const level = handLevel({
      ...chain,
      r03: ['r02.d1', 'r04.d0', 'r05.d0'],
      r05: ['r05.d1', 'r05.d0'],
    });
    expect(
      validateLevel(level)
        .filter((i) => i.check === 'V2')
        .map((i) => i.room),
    ).toEqual(['r05']);
  });

  it('V3: path too short', () => {
    const level = handLevel({ r00: ['r01.d0'], r01: ['r00.d0'] });
    expect(checks(level)).toContain('V3');
  });

  it('V4: orphan room', () => {
    const level = handLevel({ ...chain, r05: ['r00.d0'] });
    expect(validateLevel(level).find((i) => i.check === 'V4')?.room).toBe('r05');
  });

  it('V5: door linked to itself', () => {
    const level = handLevel({ ...chain, r02: ['r00.d0', 'r03.d0', 'r02.d2'] });
    expect(checks(level)).toEqual(['V5']);
  });

  it('V5: link into a sealed door (PD9)', () => {
    const level = handLevel({ ...chain, r00: ['r02.d0', 'r05.d0'], r05: [null, 'r00.d1'] });
    expect(validateLevel(level).map((i) => i.message)).toContain(
      'door r00.d1 links into sealed door r05.d0',
    );
  });

  it('V5: missing targets, duplicate ids, door count, goal field, start = goal', () => {
    const level = handLevel(chain);
    const broken: Level = {
      ...level,
      startRoom: 'r01',
      rooms: level.rooms.map((r) => {
        if (r.id === 'r00')
          return {
            ...r,
            doors: [{ ...r.doors[0], id: 'd0', link: { room: 'r09', door: 'd0' } }],
          } as typeof r;
        if (r.id === 'r02') return { ...r, goal: { x: 0, y: 1.2, z: 0 } };
        if (r.id === 'r03')
          return { ...r, doors: [...r.doors, ...r.doors, { ...r.doors[0], id: 'd0' }] } as typeof r;
        if (r.id === 'r01') return { ...r, goal: undefined };
        return r;
      }),
    };
    const messages = validateLevel(broken).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'start room and goal room are the same',
        'door r00.d0 links to missing r09.d0',
        'room r02 has a goal but is not the goal room',
        'goal room r01 has no goal position',
        'room r03 has 5 doors (1–4 allowed)',
        'room r03 has duplicate door id d0',
      ]),
    );
    expect(
      validateLevel({
        ...level,
        rooms: [...level.rooms, level.rooms[0] as Level['rooms'][number]],
      }).map((i) => i.message),
    ).toContain('duplicate room id r00');
    expect(validateLevel({ ...level, goalRoom: 'r77' }).map((i) => i.message)).toContain(
      'goal room r77 does not exist',
    );
  });

  it('V6: overlapping doors, too close, off-grid, corner margin, low ceiling', () => {
    const level = handLevel(chain);
    const room = level.rooms.find((r) => r.id === 'r02');
    if (room === undefined) throw new Error('fixture');
    const edited = finish({
      ...level,
      rooms: level.rooms.map((r) =>
        r.id !== 'r02'
          ? r
          : {
              ...r,
              width: 8,
              height: 2.0,
              doors: [
                { id: 'd0', wall: 'N', offset: 0, link: { room: 'r00', door: 'd0' } },
                { id: 'd1', wall: 'N', offset: 0.5, link: { room: 'r03', door: 'd0' } },
                { id: 'd2', wall: 'N', offset: 2.0, link: null },
                { id: 'd3', wall: 'S', offset: 3.1, link: null },
              ],
            },
      ),
    });
    const messages = validateLevel(edited)
      .filter((i) => i.check === 'V6')
      .map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'room r02 is lower than a 2.1 m door',
        'doors r02.d0 and d1 overlap',
        'doors r02.d1 and d2 are closer than 0.6 m',
        'door r02.d3 is too close to a corner',
        'door r02.d3 offset is not on the 0.25 m grid',
      ]),
    );
  });

  it('V9: recorded metrics must match; V10: recorded hash must match', () => {
    const level = handLevel(chain);
    const tampered = {
      ...level,
      meta: { ...level.meta, metrics: { ...level.meta.metrics, links: 99 } },
    };
    expect(validateLevel(tampered).map((i) => i.message)).toContain(
      'recorded metric links = 99 but the level gives 8',
    );
    expect(checks({ ...level, meta: { ...level.meta, levelHash: 'x' } })).toContain('V10');
  });
});

describe('validateLevel — generated levels', () => {
  it.each(['E1-7K2Q-X9MP', 'M1-7K2Q-X9MP', 'H1-7K2Q-X9MP'])(
    '%s is valid and keeps the invariants',
    (seed) => {
      const level = generateLevel(seed);
      expect(validateLevel(level)).toEqual([]);
      expect(checkDepthInvariants(level)).toEqual([]);
    },
  );

  it('rejects a generated level whose goal link is cut', () => {
    const level = generateLevel('M1-7K2Q-X9MP');
    // Redirect every link into the goal room to an open door of the start room.
    const goal = level.goalRoom;
    const open = level.rooms.find((r) => r.id === level.startRoom)?.doors.find((d) => d.link);
    if (open === undefined) throw new Error('start room has no open door');
    const to = { room: level.startRoom, door: open.id };
    const cut = finish({
      ...level,
      rooms: level.rooms.map((r) => ({
        ...r,
        doors: r.doors.map((d) =>
          d.link?.room === goal && r.id !== goal ? { ...d, link: to } : d,
        ),
      })),
    });
    expect(checks(cut)).toContain('V1');
  });
});

describe('checkDepthInvariants', () => {
  it('reports each broken invariant', () => {
    const level = handLevel(chain);
    const depth = { ...level.meta.depth, r03: 3, r04: 1 };
    const out = checkDepthInvariants({ ...level, meta: { ...level.meta, depth } });
    expect(out).toEqual(
      expect.arrayContaining([
        '1: r02.d1 skips ahead (1 → 3)',
        '2: room r02 has no forward link',
        '3: room r03 has no link from depth 2',
      ]),
    );
    expect(checkDepthInvariants({ ...level, meta: { ...level.meta, depth: {} } })).toEqual([
      'goal room r01 has no depth',
    ]);
  });
});
