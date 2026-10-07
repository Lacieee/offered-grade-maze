import fc from 'fast-check';
import { describe, expect, inject, it } from 'vitest';
import {
  DOOR_CORNER_MARGIN,
  DOOR_WIDTH,
  WALLS,
  WALL_HALF,
  doorFrame,
  maxDoorOffset,
  wallLength,
  type DoorFrame,
  type Wall,
} from './geometry.js';

const TOL = 1e-12;
const room = { width: 6, depth: 8 };
const w = room.width;
const d = room.depth;

function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOL);
}

function expectFrame(actual: DoorFrame, expected: DoorFrame): void {
  expectClose(actual.yaw, expected.yaw);
  expectClose(actual.origin.x, expected.origin.x);
  expectClose(actual.origin.y, expected.origin.y);
  expectClose(actual.origin.z, expected.origin.z);
  expectClose(actual.inward.x, expected.inward.x);
  expectClose(actual.inward.z, expected.inward.z);
  expectClose(actual.right.x, expected.right.x);
  expectClose(actual.right.z, expected.right.z);
}

/** The contract table of CP01 T4, for a given offset. */
function contract(wall: Wall, offset: number): DoorFrame {
  switch (wall) {
    case 'N':
      return {
        yaw: 0,
        inward: { x: 0, z: 1 },
        right: { x: 1, z: 0 },
        origin: { x: offset, y: 0, z: -d / 2 - WALL_HALF },
      };
    case 'S':
      return {
        yaw: Math.PI,
        inward: { x: 0, z: -1 },
        right: { x: -1, z: 0 },
        origin: { x: -offset, y: 0, z: d / 2 + WALL_HALF },
      };
    case 'E':
      return {
        yaw: -Math.PI / 2,
        inward: { x: -1, z: 0 },
        right: { x: 0, z: 1 },
        origin: { x: w / 2 + WALL_HALF, y: 0, z: offset },
      };
    case 'W':
      return {
        yaw: Math.PI / 2,
        inward: { x: 1, z: 0 },
        right: { x: 0, z: -1 },
        origin: { x: -w / 2 - WALL_HALF, y: 0, z: -offset },
      };
  }
}

describe('doorFrame', () => {
  it.each(WALLS.flatMap((wall) => [0.75, -1.25].map((offset) => [wall, offset] as const)))(
    'matches the contract table for wall %s, offset %d',
    (wall, offset) => {
      expectFrame(doorFrame(room, { wall, offset }), contract(wall, offset));
    },
  );

  it('places N/S origins exactly on the portal plane', () => {
    expect(doorFrame(room, { wall: 'N', offset: 1 }).origin).toEqual({ x: 1, y: 0, z: -4.15 });
    expect(doorFrame(room, { wall: 'S', offset: 1 }).origin).toEqual({ x: -1, y: 0, z: 4.15 });
    expect(doorFrame(room, { wall: 'E', offset: 1 }).origin).toEqual({ x: 3.15, y: 0, z: 1 });
    expect(doorFrame(room, { wall: 'W', offset: 1 }).origin).toEqual({ x: -3.15, y: 0, z: -1 });
  });

  it('agrees with the yaw rotation convention for every wall', () => {
    for (const wall of WALLS) {
      const f = doorFrame(room, { wall, offset: 0 });
      // Rotation by θ about +Y: local +X → (cos θ, −sin θ), local +Z → (sin θ, cos θ).
      expectClose(f.right.x, Math.cos(f.yaw));
      expectClose(f.right.z, -Math.sin(f.yaw));
      expectClose(f.inward.x, Math.sin(f.yaw));
      expectClose(f.inward.z, Math.cos(f.yaw));
    }
  });

  it('has a right-handed frame (+X = Y × Z) whose inward normal points at the room centre', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WALLS),
        fc.double({ min: -2, max: 2, noNaN: true }),
        (wall, offset) => {
          const f = doorFrame(room, { wall, offset });
          // Y × Z with Y = (0,1,0), Z = (zx, 0, zz) is (zz, 0, −zx).
          expectClose(f.right.x, f.inward.z);
          expectClose(f.right.z, -f.inward.x);
          // Moving inward from the origin approaches the room centre.
          const before = Math.hypot(f.origin.x, f.origin.z);
          const after = Math.hypot(f.origin.x + f.inward.x * 0.1, f.origin.z + f.inward.z * 0.1);
          expect(after).toBeLessThan(before);
          // origin = outward wall centre + offset · right.
          const centre = { x: f.origin.x - offset * f.right.x, z: f.origin.z - offset * f.right.z };
          const along = centre.x * f.right.x + centre.z * f.right.z;
          expectClose(along, 0);
        },
      ),
      { numRuns: inject('propRuns') },
    );
  });

  it('returns fresh objects that callers may mutate', () => {
    const a = doorFrame(room, { wall: 'N', offset: 0 });
    a.inward.z = 99;
    expect(doorFrame(room, { wall: 'N', offset: 0 }).inward.z).toBe(1);
  });
});

describe('wallLength and maxDoorOffset', () => {
  it('uses the width for N/S and the depth for E/W', () => {
    expect(wallLength(room, 'N')).toBe(6);
    expect(wallLength(room, 'S')).toBe(6);
    expect(wallLength(room, 'E')).toBe(8);
    expect(wallLength(room, 'W')).toBe(8);
  });

  it('keeps the door edge DOOR_CORNER_MARGIN from the corner', () => {
    expect(maxDoorOffset(room, 'N')).toBe(2);
    expect(maxDoorOffset(room, 'E')).toBe(3);
    for (const wall of WALLS) {
      const edge = maxDoorOffset(room, wall) + DOOR_WIDTH / 2;
      expectClose(wallLength(room, wall) / 2 - edge, DOOR_CORNER_MARGIN);
    }
  });

  it('is negative for a wall too short to hold a door', () => {
    expect(maxDoorOffset({ width: 1.5, depth: 4 }, 'N')).toBeLessThan(0);
  });
});
