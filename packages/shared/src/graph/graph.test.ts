import fc from 'fast-check';
import { describe, expect, inject, it } from 'vitest';
import { distancesFrom, distancesTo, shortestPath, type GraphRoom } from './graph.js';

/** Compact builder: `{ r00: { d0: 'r01.d1', d1: null } }`. */
function graph(spec: Record<string, Record<string, string | null>>): GraphRoom[] {
  return Object.entries(spec).map(([id, doors]) => ({
    id,
    doors: Object.entries(doors).map(([door, to]) => {
      if (to === null) return { id: door, link: null };
      const [room = '', target = ''] = to.split('.');
      return { id: door, link: { room, door: target } };
    }),
  }));
}

describe('shortestPath', () => {
  const chain = graph({
    r00: { d0: 'r01.d0', d1: 'r02.d1' },
    r01: { d0: 'r00.d0', d1: 'r02.d0' },
    r02: { d0: 'r03.d0', d1: null },
    r03: { d0: 'r02.d0' },
  });

  it('returns door-level steps with null ends', () => {
    expect(shortestPath(chain, 'r00', 'r03')).toEqual([
      { room: 'r00', arriveDoor: null, exitDoor: 'd1' },
      { room: 'r02', arriveDoor: 'd1', exitDoor: 'd0' },
      { room: 'r03', arriveDoor: 'd0', exitDoor: null },
    ]);
  });

  it('returns a single step when from === to', () => {
    expect(shortestPath(chain, 'r01', 'r01')).toEqual([
      { room: 'r01', arriveDoor: null, exitDoor: null },
    ]);
  });

  it('returns null for unreachable targets and unknown rooms', () => {
    expect(shortestPath(chain, 'r03', 'r00')).toBeNull();
    expect(shortestPath(chain, 'r00', 'r99')).toBeNull();
    expect(shortestPath(chain, 'r99', 'r00')).toBeNull();
  });

  it('ignores self-links (the room is already visited)', () => {
    const g = graph({
      r00: { d0: 'r00.d1', d1: 'r00.d0', d2: 'r01.d0' },
      r01: { d0: null },
    });
    expect(shortestPath(g, 'r00', 'r01')).toEqual([
      { room: 'r00', arriveDoor: null, exitDoor: 'd2' },
      { room: 'r01', arriveDoor: 'd0', exitDoor: null },
    ]);
  });

  it('picks the lowest door id among multi-edges, whatever the array order', () => {
    const g: GraphRoom[] = [
      {
        id: 'r00',
        doors: [
          { id: 'd3', link: { room: 'r01', door: 'd0' } },
          { id: 'd1', link: { room: 'r01', door: 'd2' } },
          { id: 'd2', link: { room: 'r01', door: 'd1' } },
        ],
      },
      { id: 'r01', doors: [{ id: 'd0', link: null }] },
    ];
    expect(shortestPath(g, 'r00', 'r01')).toEqual([
      { room: 'r00', arriveDoor: null, exitDoor: 'd1' },
      { room: 'r01', arriveDoor: 'd2', exitDoor: null },
    ]);
  });

  it('breaks ties by BFS order: the first room expanded wins', () => {
    // Two shortest routes to r03: via r01 (door d0 of r00) and via r02 (door d1).
    const g = graph({
      r00: { d0: 'r02.d0', d1: 'r01.d0' },
      r01: { d0: 'r03.d1' },
      r02: { d0: 'r03.d0' },
      r03: { d0: null, d1: null },
    });
    const path = shortestPath(g, 'r00', 'r03');
    expect(path?.map((s) => s.room)).toEqual(['r00', 'r02', 'r03']);
  });

  it('skips links to rooms that do not exist', () => {
    const g = graph({ r00: { d0: 'r09.d0', d1: 'r01.d0' }, r01: { d0: null } });
    expect(shortestPath(g, 'r00', 'r01')?.length).toBe(2);
  });

  it('property: path length equals the BFS distance and every step follows a real link', () => {
    const arb = fc.integer({ min: 2, max: 12 }).chain((n) =>
      fc.array(
        fc.array(fc.option(fc.tuple(fc.nat(n - 1), fc.nat(3)), { nil: null }), {
          minLength: 1,
          maxLength: 4,
        }),
        { minLength: n, maxLength: n },
      ),
    );
    fc.assert(
      fc.property(arb, (spec) => {
        const id = (i: number): string => `r${String(i).padStart(2, '0')}`;
        const rooms: GraphRoom[] = spec.map((doors, i) => ({
          id: id(i),
          doors: doors.map((l, j) => ({
            id: `d${j}`,
            link: l === null ? null : { room: id(l[0]), door: `d${l[1]}` },
          })),
        }));
        const last = id(spec.length - 1);
        const path = shortestPath(rooms, 'r00', last);
        const dist = distancesFrom(rooms, 'r00').get(last);
        if (path === null) return dist === undefined;
        if (path.length - 1 !== dist) return false;
        for (let k = 0; k + 1 < path.length; k++) {
          const step = path[k];
          const next = path[k + 1];
          const room = rooms.find((r) => r.id === step?.room);
          const door = room?.doors.find((d) => d.id === step?.exitDoor);
          const link = door?.link;
          if (link?.room !== next?.room || link?.door !== next?.arriveDoor) return false;
        }
        return distancesTo(rooms, last).get('r00') === dist;
      }),
      { numRuns: inject('propRuns') },
    );
  });
});

describe('distancesFrom / distancesTo', () => {
  const g = graph({
    r00: { d0: 'r01.d0', d1: null },
    r01: { d0: 'r02.d0', d1: 'r00.d1' },
    r02: { d0: 'r02.d1', d1: 'r01.d1' },
    r03: { d0: 'r02.d0' },
  });

  it('measures forward BFS distances', () => {
    expect([...distancesFrom(g, 'r00')]).toEqual([
      ['r00', 0],
      ['r01', 1],
      ['r02', 2],
    ]);
    expect(distancesFrom(g, 'r99').size).toBe(0);
  });

  it('measures reverse BFS distances', () => {
    expect(Object.fromEntries(distancesTo(g, 'r00'))).toEqual({ r00: 0, r01: 1, r02: 2, r03: 3 });
    expect(distancesTo(g, 'r99').size).toBe(0);
  });
});
