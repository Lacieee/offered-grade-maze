import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateLevel } from '../generate.js';
import type { CheckId, Level } from '../types.js';
import { finish, handLevel } from './__fixtures__/handLevel.js';
import { checkFurniture, checkRoomLights } from './furniture.js';
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

describe('furniture checks V7, V8, V11 (CP05 T7)', () => {
  type Room = Level['rooms'][number];
  type Item = Room['furniture'][number];
  /** The chain level with one room replaced. */
  const withRoom = (id: string, edit: (r: Room) => Room): Level => {
    const level = handLevel(chain);
    return finish({ ...level, rooms: level.rooms.map((r) => (r.id === id ? edit(r) : r)) });
  };
  const furnished = (r: Room, ...items: Omit<Item, 'id'>[]): Room => ({
    ...r,
    furniture: [
      ...r.furniture,
      ...items.map((f, i) => ({ ...f, id: `f${String(i + 1).padStart(2, '0')}` })),
    ],
  });
  const messages = (level: Level, check: CheckId): string[] =>
    validateLevel(level)
      .filter((i) => i.check === check)
      .map((i) => i.message);

  it('V8: a sofa placed across a hallway', () => {
    // 2 × 6 m hallway, doors on N and S; a 2 m sofa spans its whole width.
    const level = withRoom('r03', (r) =>
      furnished(
        {
          ...r,
          type: 'hallway',
          label: 'room.hallway',
          width: 2,
          depth: 6,
          doors: [
            { id: 'd0', wall: 'N', offset: 0, link: { room: 'r02', door: 'd1' } },
            { id: 'd1', wall: 'S', offset: 0, link: { room: 'r04', door: 'd0' } },
          ],
          furniture: [{ ...(r.furniture[0] as Item), x: -0.375, z: -2.875 }],
        },
        { prefab: 'sofa_3seat', x: 0, z: 0, rot: 0, variant: 0, colors: ['#111111', '#222222'] },
      ),
    );
    expect(messages(level, 'V8')).toEqual([
      'room r03: doors, spawn and goal zones are not all connected',
    ]);
    // The sofa is not a hallway item either.
    expect(messages(level, 'V7')).toContain('r03.f01 (sofa_3seat) is not allowed in a hallway');
  });

  it('V7: a wardrobe in a door clearance zone', () => {
    const level = withRoom('r02', (r) =>
      furnished(
        { ...r, type: 'bedroom', label: 'room.bedroom' },
        // d0 is in the middle of the north wall: the wardrobe stands right in front of it.
        { prefab: 'wardrobe', x: 0, z: -1.625, rot: 0, variant: 1, colors: ['#111111', '#222222'] },
      ),
    );
    expect(messages(level, 'V7')).toEqual(['r02.f01 (wardrobe) stands in a reserved zone']);
  });

  it('V7 and V8: a dining set over the goal zone, a ring of cabinets around it', () => {
    const goal = 'r01';
    const over = withRoom(goal, (r) =>
      furnished(
        { ...r, type: 'kitchen', label: 'room.kitchen' },
        { prefab: 'dining_set', x: 0, z: 0, rot: 0, variant: 1, colors: ['#111111', '#222222'] },
      ),
    );
    expect(messages(over, 'V7')).toEqual(['r01.f01 (dining_set) stands in a reserved zone']);

    // 6 × 6 m kitchen: fridges (0.75 m) ring the 1.5 m goal zone just outside it.
    const ring: Omit<Item, 'id'>[] = [];
    for (let k = -1.125; k <= 1.125; k += 0.75) {
      for (const [x, z] of [
        [k, -1.125],
        [k, 1.125],
        [-1.125, k],
        [1.125, k],
      ] as const) {
        if (ring.some((f) => f.x === x && f.z === z)) continue;
        ring.push({ prefab: 'fridge', x, z, rot: 0, variant: 0, colors: ['#eeeeee'] });
      }
    }
    const enclosed = withRoom(goal, (r) =>
      furnished(
        {
          ...r,
          type: 'kitchen',
          label: 'room.kitchen',
          width: 6,
          depth: 6,
          furniture: [{ ...(r.furniture[0] as Item) }],
        },
        ...ring,
      ),
    );
    expect(messages(enclosed, 'V7')).toEqual([]);
    expect(messages(enclosed, 'V8')).toEqual([
      'room r01: doors, spawn and goal zones are not all connected',
    ]);
  });

  it('V7: overlaps, colours, variants, grid, footprint, signatures, painting params', () => {
    const level = withRoom('r04', (r) =>
      furnished(
        r,
        { prefab: 'globe', x: 1.25, z: 1.25, rot: 0, variant: 0, colors: ['#111111', '#222222'] },
        { prefab: 'globe', x: 1.25, z: 1.25, rot: 0, variant: 0, colors: ['#111111'] },
        { prefab: 'globe', x: 1.3, z: 1.25, rot: 0, variant: 0, colors: ['#111111', '#222222'] },
        { prefab: 'globe', x: 1.25, z: 1.25, rot: 0, variant: 3, colors: ['#111111', '#222222'] },
        { prefab: 'globe', x: 2.0, z: 0.75, rot: 0, variant: 0, colors: ['#111111', '#222222'] },
        {
          prefab: 'painting',
          x: 0.5,
          z: 1.875,
          rot: 0,
          variant: 0,
          colors: ['#111111', '#222222', '#333333'],
          params: { pattern: 'dots', seed: 1 },
        },
        {
          prefab: 'sig_aquarium',
          x: -1.375,
          z: 1.5,
          rot: 0,
          variant: 0,
          colors: ['#111111', '#222222'],
          signature: true,
        },
      ),
    );
    expect(messages(level, 'V7')).toEqual(
      expect.arrayContaining([
        'r04.f02 (globe) has 1 colours, expected 2',
        'r04.f02 (globe) overlaps r04.f01',
        'r04.f03 (globe) is off the 0.25 m grid or has an unknown variant',
        'r04.f04 (globe) is off the 0.25 m grid or has an unknown variant',
        'r04.f05 (globe) is outside the footprint',
        'r04.f06 (painting) has invalid painting params',
        'room r04 has 2 signature items',
      ]),
    );
    const flagged = withRoom('r04', (r) =>
      furnished(r, {
        prefab: 'globe',
        x: 1.25,
        z: 1.25,
        rot: 0,
        variant: 0,
        colors: ['#111111', '#222222'],
        signature: true,
      }),
    );
    expect(messages(flagged, 'V7')).toContain(
      'r04.f01 (globe): signature flag does not match the prefab role',
    );
  });

  it('V7: two rooms may not share a signature', () => {
    const level = handLevel(chain);
    const sig = level.rooms[0]?.furniture[0];
    const copy = finish({
      ...level,
      rooms: level.rooms.map((r) =>
        r.id === 'r03' && sig ? { ...r, furniture: [{ ...sig }] } : r,
      ),
    });
    expect(messages(copy, 'V7')).toEqual(['rooms r00 and r03 share a signature']);
  });

  it('V11: light count and the goal light', () => {
    const level = handLevel(chain);
    const ceiling = {
      kind: 'ceiling' as const,
      x: 0,
      y: 2.6,
      z: 0,
      color: '#ffffff',
      intensity: 1,
    };
    const goalLight = { ...ceiling, kind: 'goal' as const };
    const edited = finish({
      ...level,
      rooms: level.rooms.map((r) =>
        r.id === 'r01'
          ? { ...r, lights: [ceiling] }
          : r.id === 'r02'
            ? { ...r, lights: [ceiling, goalLight] }
            : r,
      ),
    });
    expect(messages(edited, 'V11')).toEqual([
      'goal room r01 has 0 goal lights',
      'room r02 has a goal light',
    ]);
    // More than 4 lights already fails the RoomDTO schema (V5); the V11 check itself:
    const out: string[] = [];
    const r03 = level.rooms.find((r) => r.id === 'r03');
    if (r03 === undefined) throw new Error('fixture');
    checkRoomLights({ ...r03, lights: Array.from({ length: 5 }, () => ceiling) }, false, (_c, m) =>
      out.push(m),
    );
    expect(out).toEqual(['room r03 has 5 lights']);
  });
});

describe('the client fixture house furniture (CP05)', () => {
  it('passes V7, V8 and V11', () => {
    const dir = new URL('../../../client/src/dev/fixtures/', import.meta.url);
    const rooms = ['r00', 'r01', 'r02', 'r03', 'r04', 'r05'].map(
      (id) =>
        JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8')) as Level['rooms'][number],
    );
    const issues: string[] = [];
    checkFurniture(rooms, 'r00', 'r05', (check, message) => issues.push(`${check} ${message}`));
    expect(issues).toEqual([]);
  });
});
