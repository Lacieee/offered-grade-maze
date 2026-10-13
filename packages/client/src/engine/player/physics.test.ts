import { PLAYER_RADIUS, WALK_SPEED } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import {
  accelerate,
  circleContact,
  forwardVector,
  resolveCollisions,
  rightVector,
  stepBody,
  wishDirection,
  yawToward,
  type Body,
  type BoxCollider,
  type Collider,
  type MoveIntent,
  type SegmentCollider,
} from './physics.js';

const DT = 1 / 60;
const R = PLAYER_RADIUS;
const idle: MoveIntent = { forward: false, back: false, left: false, right: false };
const fwd: MoveIntent = { ...idle, forward: true };

const seg = (ax: number, az: number, bx: number, bz: number): SegmentCollider => ({
  kind: 'segment',
  ax,
  az,
  bx,
  bz,
});
const box = (minX: number, minZ: number, maxX: number, maxZ: number): BoxCollider => ({
  kind: 'box',
  minX,
  minZ,
  maxX,
  maxZ,
});

function run(
  body: Body,
  intent: MoveIntent,
  yaw: number,
  colliders: Collider[],
  seconds: number,
): Body {
  let b = body;
  for (let i = 0; i < Math.round(seconds / DT); i++) b = stepBody(b, intent, yaw, DT, colliders);
  return b;
}

/** True if the circle overlaps no collider by more than `tolerance` metres. */
function clear(b: Body, colliders: Collider[], tolerance = 1e-9): boolean {
  return colliders.every((c) => {
    const contact = circleContact(b.x, b.z, R, c);
    return contact === null || contact.depth < tolerance;
  });
}

describe('heading vectors', () => {
  it('yaw 0 looks toward −Z, yaw π/2 toward −X; right is perpendicular', () => {
    expect(forwardVector(0).x).toBeCloseTo(0);
    expect(forwardVector(0).z).toBeCloseTo(-1);
    expect(forwardVector(Math.PI / 2).x).toBeCloseTo(-1);
    expect(rightVector(0).x).toBeCloseTo(1);
    expect(rightVector(0).z).toBeCloseTo(0);
  });

  it('yawToward points the forward vector at the target', () => {
    for (const [tx, tz] of [
      [3, 0],
      [0, 3],
      [-2, -5],
      [1, -1],
    ] as const) {
      const f = forwardVector(yawToward(0, 0, tx, tz));
      const len = Math.hypot(tx, tz);
      expect(f.x).toBeCloseTo(tx / len);
      expect(f.z).toBeCloseTo(tz / len);
    }
  });
});

describe('wishDirection', () => {
  it('is zero when idle or when opposite keys cancel', () => {
    expect(wishDirection(idle, 1)).toEqual({ x: 0, z: 0 });
    expect(wishDirection({ ...idle, forward: true, back: true }, 1)).toEqual({ x: 0, z: 0 });
  });

  it('follows the camera heading and normalises diagonals', () => {
    const yaw = 0.7;
    const w = wishDirection(fwd, yaw);
    expect(w.x).toBeCloseTo(forwardVector(yaw).x);
    expect(w.z).toBeCloseTo(forwardVector(yaw).z);
    const d = wishDirection({ ...idle, forward: true, right: true }, yaw);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
    const s = wishDirection({ ...idle, left: true }, 0);
    expect(s.x).toBeCloseTo(-1);
  });
});

describe('accelerate', () => {
  it('reaches walking speed in 0.15 s and stops within 0.15 s', () => {
    let v = { vx: 0, vz: 0 };
    for (let i = 0; i < 9; i++) v = accelerate(v.vx, v.vz, { x: 0, z: -1 }, DT);
    expect(-v.vz).toBeCloseTo(WALK_SPEED, 5);
    for (let i = 0; i < 9; i++) v = accelerate(v.vx, v.vz, { x: 0, z: 0 }, DT);
    expect(v).toEqual({ vx: 0, vz: 0 });
  });

  it('never exceeds walking speed', () => {
    let v = { vx: 0, vz: 0 };
    for (let i = 0; i < 120; i++) v = accelerate(v.vx, v.vz, { x: 0.6, z: 0.8 }, DT);
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(WALK_SPEED, 9);
  });
});

describe('collision', () => {
  // A wall along z = −2 (the player starts at the origin and walks north, toward −Z).
  const wall = seg(-10, -2, 10, -2);

  it('head-on: stops at the wall, one radius away, with zero velocity', () => {
    const b = run({ x: 0, z: 0, vx: 0, vz: 0 }, fwd, 0, [wall], 2);
    expect(b.z).toBeCloseTo(-2 + R, 5);
    expect(b.x).toBeCloseTo(0, 9);
    expect(Math.abs(b.vz)).toBeLessThan(1e-9);
    expect(clear(b, [wall])).toBe(true);
  });

  it('30° slide: keeps moving along the wall with the tangential speed', () => {
    // Heading 30° off the wall normal toward −X: yaw = +30°.
    const yaw = Math.PI / 6;
    const b = run({ x: 0, z: 0, vx: 0, vz: 0 }, fwd, yaw, [wall], 2);
    expect(b.z).toBeCloseTo(-2 + R, 5);
    expect(b.vz).toBeCloseTo(0, 6);
    expect(b.vx).toBeCloseTo(-WALK_SPEED * Math.sin(yaw), 5);
    expect(b.x).toBeLessThan(-2);
  });

  it('corner pocket: rests in the corner touching both walls', () => {
    const colliders = [wall, seg(-2, -10, -2, 10)];
    const yaw = Math.PI / 4; // toward (−X, −Z)
    const b = run({ x: 0, z: 0, vx: 0, vz: 0 }, fwd, yaw, colliders, 3);
    expect(b.x).toBeCloseTo(-2 + R, 4);
    expect(b.z).toBeCloseTo(-2 + R, 4);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThan(1e-6);
    expect(clear(b, colliders)).toBe(true);
  });

  it('a centre exactly on a box edge is pushed out, never NaN (CP09: NaN audio listener)', () => {
    const b = box(-0.5, 1, 0.5, 2);
    for (const [x, z] of [
      [-0.5, 1.5], // on the west edge
      [0.5, 1.5], // east
      [0, 1], // north
      [0, 2], // south
      [0.5, 2], // a corner
    ] as const) {
      const c = circleContact(x, z, R, b);
      expect(c, `${String(x)}, ${String(z)}`).not.toBeNull();
      expect(Number.isFinite(c?.nx) && Number.isFinite(c?.nz), `${String(x)}, ${String(z)}`).toBe(
        true,
      );
      expect(c?.depth).toBeCloseTo(R, 9);
      const out = stepBody({ x, z, vx: 0, vz: 0 }, idle, 0, DT, [b]);
      expect(Number.isFinite(out.x) && Number.isFinite(out.z)).toBe(true);
      expect(clear(out, [b], 1e-6)).toBe(true);
    }
  });

  it('between two boxes 0.7 m apart: passable', () => {
    const boxes = [box(-1.35, -3, -0.35, -2), box(0.35, -3, 1.35, -2)];
    const b = run({ x: 0.03, z: 0, vx: 0, vz: 0 }, fwd, 0, boxes, 3);
    expect(b.z).toBeLessThan(-4);
    expect(clear(b, boxes)).toBe(true);
  });

  it('between two boxes 0.5 m apart: blocked', () => {
    const boxes = [box(-1.25, -3, -0.25, -2), box(0.25, -3, 1.25, -2)];
    const b = run({ x: 0, z: 0, vx: 0, vz: 0 }, fwd, 0, boxes, 3);
    expect(b.z).toBeGreaterThan(-2);
    expect(Math.abs(b.x)).toBeLessThan(0.01);
    // Pushing into a wedge leaves at most a sub-millimetre overlap per step (4 iterations).
    expect(clear(b, boxes, 1e-3)).toBe(true);
  });

  it('box corner: deflects around it instead of sticking', () => {
    const b = run({ x: 0.2, z: 0, vx: 0, vz: 0 }, fwd, 0, [box(-1, -3, 0, -2)], 3);
    expect(b.z).toBeLessThan(-3);
    expect(b.x).toBeGreaterThan(0.2);
  });

  it('never tunnels through a thin segment at walking speed', () => {
    const b = run({ x: 0, z: 0, vx: 0, vz: -WALK_SPEED }, fwd, 0, [wall], 5);
    expect(b.z).toBeGreaterThan(-2);
  });

  it('pushes a centre lying exactly on a segment off it', () => {
    const b = resolveCollisions({ x: 0, z: -2, vx: 0, vz: 0 }, [wall]);
    expect(clear(b, [wall])).toBe(true);
  });

  it('pushes a centre inside a box out through the nearest side', () => {
    const b = resolveCollisions({ x: 0.9, z: 0, vx: -1, vz: 0 }, [box(-1, -1, 1, 1)]);
    expect(b.x).toBeCloseTo(1 + R, 5);
    expect(b.vx).toBe(0);
  });

  it('a doorway with jambs and a blocking segment lets the player in but not through', () => {
    // North wall at z = −2 with an opening x ∈ [−0.5, 0.5], wall thickness 0.15.
    const colliders: Collider[] = [
      seg(-3, -2, -0.5, -2),
      seg(0.5, -2, 3, -2),
      seg(-0.5, -2, -0.5, -2.15),
      seg(0.5, -2, 0.5, -2.15),
      seg(-0.5, -2.15, 0.5, -2.15),
    ];
    const b = run({ x: 0.1, z: 0, vx: 0, vz: 0 }, fwd, 0, colliders, 3);
    expect(b.z).toBeCloseTo(-2.15 + R, 4);
    expect(Math.abs(b.x)).toBeLessThanOrEqual(0.2 + 1e-6);
  });
});
