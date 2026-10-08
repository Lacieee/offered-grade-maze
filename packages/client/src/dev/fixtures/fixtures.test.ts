import {
  DOOR_CLEARANCE_D,
  DOOR_CLEARANCE_W,
  DOOR_SPACING,
  DOOR_WIDTH,
  PLAYER_RADIUS,
  WALL_HALF,
  doorFrame,
  maxDoorOffset,
  type RoomDTO,
} from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { circleContact, forwardVector, type Collider } from '../../engine/player/physics.js';
import { furnitureFootprint, layoutRoom } from '../../engine/rooms/layout.js';
import { FIXTURE_GOAL, FIXTURE_ROOMS, FIXTURE_START, fixtureRoom, fixtureSpawn } from './index.js';

const room = (id: string): RoomDTO => {
  const r = fixtureRoom(id);
  if (!r) throw new Error(`missing fixture ${id}`);
  return r;
};

/** CP02 T3 room table: type, size and door walls. */
const ROOM_TABLE = {
  r00: { type: 'living', w: 7.0, d: 7.5, walls: ['N', 'E', 'W'] },
  r01: { type: 'kitchen', w: 5.0, d: 5.0, walls: ['S', 'W', 'N', 'E'] },
  r02: { type: 'bedroom', w: 5.0, d: 5.5, walls: ['S', 'E'] },
  r03: { type: 'bathroom', w: 3.5, d: 3.5, walls: ['S', 'N'] },
  r04: { type: 'hallway', w: 2.5, d: 8.0, walls: ['S', 'N', 'E'] },
  r05: { type: 'study', w: 4.5, d: 4.5, walls: ['S', 'W'] },
} as const;

/** CP02 T3 link table: the contract CP03 tests depend on. */
const LINKS: Record<string, string | null> = {
  'r00.d0': 'r01.d0',
  'r01.d0': 'r00.d0',
  'r01.d1': 'r00.d2',
  'r00.d2': 'r04.d0',
  'r01.d2': 'r02.d0',
  'r02.d0': 'r03.d0',
  'r02.d1': 'r02.d0',
  'r03.d0': 'r01.d2',
  'r01.d3': null,
  'r03.d1': 'r05.d0',
  'r05.d0': 'r03.d1',
  'r05.d1': 'r04.d1',
  'r04.d1': 'r05.d1',
  'r04.d0': 'r00.d1',
  'r04.d2': 'r01.d1',
  'r00.d1': 'r04.d2',
};

/** Clearance zone in front of a door, as an axis-aligned rectangle in room coordinates. */
function clearanceZone(r: RoomDTO, door: RoomDTO['doors'][number]) {
  const f = doorFrame(r, door);
  const edge = { x: f.origin.x + f.inward.x * WALL_HALF, z: f.origin.z + f.inward.z * WALL_HALF };
  const corners = [-1, 1].flatMap((s) =>
    [0, DOOR_CLEARANCE_D].map((t) => ({
      x: edge.x + (f.right.x * (s * DOOR_CLEARANCE_W)) / 2 + f.inward.x * t,
      z: edge.z + (f.right.z * (s * DOOR_CLEARANCE_W)) / 2 + f.inward.z * t,
    })),
  );
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    maxX: Math.max(...corners.map((c) => c.x)),
    minZ: Math.min(...corners.map((c) => c.z)),
    maxZ: Math.max(...corners.map((c) => c.z)),
    front: { x: edge.x + f.inward.x * 0.6, z: edge.z + f.inward.z * 0.6 },
  };
}

const overlaps = (
  a: { minX: number; maxX: number; minZ: number; maxZ: number },
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

const free = (x: number, z: number, colliders: Collider[]) =>
  colliders.every((c) => circleContact(x, z, PLAYER_RADIUS, c) === null);

/** Flood fill over a 5 cm grid of player positions; true if `to` is reachable from `from`. */
function reachable(
  r: RoomDTO,
  colliders: Collider[],
  from: { x: number; z: number },
  to: { x: number; z: number },
) {
  const step = 0.05;
  const key = (i: number, j: number) => `${i},${j}`;
  const nx = Math.round(r.width / step);
  const nz = Math.round(r.depth / step);
  const toCell = (p: { x: number; z: number }) =>
    [Math.round((p.x + r.width / 2) / step), Math.round((p.z + r.depth / 2) / step)] as const;
  const [si, sj] = toCell(from);
  const [ti, tj] = toCell(to);
  const seen = new Set([key(si, sj)]);
  const queue: [number, number][] = [[si, sj]];
  while (queue.length > 0) {
    const [i, j] = queue.shift() ?? [0, 0];
    if (Math.abs(i - ti) <= 1 && Math.abs(j - tj) <= 1) return true;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a > nx || b > nz || seen.has(key(a, b))) continue;
      if (!free(a * step - r.width / 2, b * step - r.depth / 2, colliders)) continue;
      seen.add(key(a, b));
      queue.push([a, b]);
    }
  }
  return false;
}

describe('fixture house', () => {
  it('has six rooms r00…r05 that validate against the shared schema', () => {
    expect(FIXTURE_ROOMS.map((r) => r.id)).toEqual(['r00', 'r01', 'r02', 'r03', 'r04', 'r05']);
    expect(FIXTURE_START).toBe('r00');
    expect(FIXTURE_GOAL).toBe('r05');
    expect(room('r05').goal).toBeDefined();
  });

  it.each(Object.entries(ROOM_TABLE))('%s matches the room table', (id, spec) => {
    const r = room(id);
    expect(r.type).toBe(spec.type);
    expect([r.width, r.depth, r.height]).toEqual([spec.w, spec.d, 2.8]);
    expect(r.doors.map((d) => d.id)).toEqual(spec.walls.map((_, i) => `d${i}`));
    expect(r.doors.map((d) => d.wall)).toEqual(spec.walls);
    expect(r.label).toBe(`room.${spec.type}`);
  });

  it('has exactly the links of the contract table', () => {
    const actual: Record<string, string | null> = {};
    for (const r of FIXTURE_ROOMS) {
      for (const d of r.doors) {
        actual[`${r.id}.${d.id}`] = d.link ? `${d.link.room}.${d.link.door}` : null;
      }
    }
    expect(actual).toEqual(LINKS);
  });

  it('no link arrives at a sealed door (PD9: sealed doors are decorative)', () => {
    for (const r of FIXTURE_ROOMS) {
      for (const d of r.doors) {
        if (!d.link) continue;
        const arrival = room(d.link.room).doors.find((t) => t.id === d.link?.door);
        expect(arrival?.link, `${r.id}.${d.id} → ${d.link.room}.${d.link.door}`).not.toBeNull();
      }
    }
  });

  it('every link points at an existing door', () => {
    for (const r of FIXTURE_ROOMS) {
      for (const d of r.doors) {
        if (!d.link) continue;
        const target = room(d.link.room);
        expect(target.doors.some((t) => t.id === d.link?.door)).toBe(true);
      }
    }
  });

  it.each(FIXTURE_ROOMS.map((r) => [r.id, r] as const))(
    '%s: doors respect the corner and spacing rules',
    (_id, r) => {
      for (const d of r.doors) {
        expect(Math.abs(d.offset)).toBeLessThanOrEqual(maxDoorOffset(r, d.wall) + 1e-9);
      }
      for (const a of r.doors) {
        for (const b of r.doors) {
          if (a === b || a.wall !== b.wall) continue;
          expect(Math.abs(a.offset - b.offset) - DOOR_WIDTH).toBeGreaterThanOrEqual(DOOR_SPACING);
        }
      }
    },
  );

  it.each(FIXTURE_ROOMS.map((r) => [r.id, r] as const))(
    '%s: 3–6 furniture boxes inside the footprint and clear of every door zone',
    (_id, r) => {
      expect(r.furniture.length).toBeGreaterThanOrEqual(3);
      expect(r.furniture.length).toBeLessThanOrEqual(6);
      for (const f of r.furniture) {
        const fp = furnitureFootprint(f);
        expect(fp.minX).toBeGreaterThanOrEqual(-r.width / 2);
        expect(fp.maxX).toBeLessThanOrEqual(r.width / 2);
        expect(fp.minZ).toBeGreaterThanOrEqual(-r.depth / 2);
        expect(fp.maxZ).toBeLessThanOrEqual(r.depth / 2);
        for (const d of r.doors) expect(overlaps(fp, clearanceZone(r, d))).toBe(false);
      }
    },
  );

  it.each(FIXTURE_ROOMS.map((r) => [r.id, r] as const))(
    '%s: one ceiling light at (0, 2.6, 0)',
    (_id, r) => {
      expect(r.lights).toEqual([expect.objectContaining({ kind: 'ceiling', x: 0, y: 2.6, z: 0 })]);
    },
  );

  it('gives every room a distinct palette', () => {
    const palettes = new Set(FIXTURE_ROOMS.map((r) => JSON.stringify(r.palette)));
    expect(palettes.size).toBe(FIXTURE_ROOMS.length);
  });

  it.each(FIXTURE_ROOMS.map((r) => [r.id, r] as const))(
    '%s: the spawn is free, faces d0, and every door is reachable from it',
    (_id, r) => {
      const { colliders } = layoutRoom(r);
      const spawn = fixtureSpawn(r);
      expect(free(spawn.x, spawn.z, colliders)).toBe(true);
      const d0 = r.doors[0];
      if (!d0) throw new Error('no d0');
      const o = doorFrame(r, d0).origin;
      const f = forwardVector(spawn.yaw);
      const len = Math.hypot(o.x - spawn.x, o.z - spawn.z);
      expect(f.x).toBeCloseTo((o.x - spawn.x) / len);
      expect(f.z).toBeCloseTo((o.z - spawn.z) / len);
      for (const d of r.doors) {
        expect(reachable(r, colliders, spawn, clearanceZone(r, d).front)).toBe(true);
      }
    },
  );
});
