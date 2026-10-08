import { DOOR_HEIGHT, EYE_HEIGHT, WALLS, doorFrame, type DoorFrame, type Wall } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { forwardVector } from '../player/physics.js';
import { fromDoorLocal, toDoorLocal } from './portalMath.js';
import {
  MIN_PORTAL_EYE_DISTANCE,
  crossPose,
  findCrossing,
  keepEyeOffPortals,
  renderPose,
  type CrossableDoor,
  type Pose,
} from './traversal.js';

const roomA = { width: 6, depth: 7 };
const roomB = { width: 5, depth: 4.5 };

function door(wa: Wall, wb: Wall): CrossableDoor {
  return {
    id: 'd0',
    frame: doorFrame(roomA, { wall: wa, offset: 0.6 }),
    link: { room: 'r01', door: 'd1' },
    targetFrame: doorFrame(roomB, { wall: wb, offset: -0.9 }),
  };
}

/** A point at door-local (x, z) in room coordinates. */
const at = (f: DoorFrame, x: number, z: number) => fromDoorLocal(f, x, z);

describe('findCrossing', () => {
  const d = door('N', 'E');

  it('detects z going from ≥ 0 to < 0 inside the opening', () => {
    expect(findCrossing(at(d.frame, 0.1, 0.02), at(d.frame, 0.12, -0.03), EYE_HEIGHT, [d])).toBe(d);
    expect(findCrossing(at(d.frame, 0, 0), at(d.frame, 0, -0.01), EYE_HEIGHT, [d])).toBe(d);
  });

  it('ignores movement that stays on one side or goes back into the room', () => {
    expect(findCrossing(at(d.frame, 0, 0.3), at(d.frame, 0, 0.25), EYE_HEIGHT, [d])).toBeNull();
    expect(findCrossing(at(d.frame, 0, -0.05), at(d.frame, 0, 0.05), EYE_HEIGHT, [d])).toBeNull();
  });

  it('ignores a crossing of the plane outside the opening', () => {
    expect(
      findCrossing(at(d.frame, 0.6, 0.02), at(d.frame, 0.6, -0.02), EYE_HEIGHT, [d]),
    ).toBeNull();
  });

  it('needs the eye within the opening height', () => {
    const a = at(d.frame, 0, 0.02);
    const b = at(d.frame, 0, -0.02);
    expect(findCrossing(a, b, DOOR_HEIGHT + 0.1, [d])).toBeNull();
  });
});

describe('crossPose', () => {
  const pairs: [Wall, Wall][] = WALLS.flatMap((a) => WALLS.map((b) => [a, b] as [Wall, Wall]));

  it.each(pairs)('%s → %s: position, heading and motion stay continuous', (wa, wb) => {
    const d = door(wa, wb);
    // Walking through the door at an angle: 25° off the door normal, at walking speed.
    const inward = d.frame.inward;
    const right = d.frame.right;
    const angle = 0.44;
    const dir = {
      x: -inward.x * Math.cos(angle) + right.x * Math.sin(angle),
      z: -inward.z * Math.cos(angle) + right.z * Math.sin(angle),
    };
    const yaw = Math.atan2(-dir.x, -dir.z);
    const start = at(d.frame, 0.1, -0.02);
    const pose: Pose = { x: start.x, z: start.z, yaw, pitch: 0.2, vx: dir.x * 3, vz: dir.z * 3 };
    const out = crossPose(pose, d.frame, d.targetFrame);

    // Position: door-local (x, z) of D becomes (−x, −z) of E.
    const lin = toDoorLocal(d.frame, pose.x, pose.z);
    const lout = toDoorLocal(d.targetFrame, out.x, out.z);
    expect(lout.x).toBeCloseTo(-lin.x, 9);
    expect(lout.z).toBeCloseTo(-lin.z, 9);

    // Heading relative to the door is unchanged; the camera still looks where it moves.
    const f = forwardVector(out.yaw);
    const speed = Math.hypot(out.vx, out.vz);
    expect(speed).toBeCloseTo(3, 9);
    expect(f.x).toBeCloseTo(out.vx / speed, 9);
    expect(f.z).toBeCloseTo(out.vz / speed, 9);
    const relIn = dir.x * -d.frame.inward.x + dir.z * -d.frame.inward.z;
    const relOut =
      (out.vx / speed) * d.targetFrame.inward.x + (out.vz / speed) * d.targetFrame.inward.z;
    expect(relOut).toBeCloseTo(relIn, 9);
    expect(out.pitch).toBe(0.2);
  });

  it('keeps a step that straddles the plane continuous (previous state transformed too)', () => {
    const d = door('W', 'S');
    const prev: Pose = { ...at(d.frame, 0, 0.03), yaw: 0, pitch: 0, vx: 0, vz: 0 };
    const cur: Pose = { ...at(d.frame, 0, -0.02), yaw: 0, pitch: 0, vx: 0, vz: 0 };
    const p2 = crossPose(prev, d.frame, d.targetFrame);
    const c2 = crossPose(cur, d.frame, d.targetFrame);
    // The step length is preserved, so interpolating between them never jumps.
    expect(Math.hypot(c2.x - p2.x, c2.z - p2.z)).toBeCloseTo(
      Math.hypot(cur.x - prev.x, cur.z - prev.z),
      12,
    );
  });
});

describe('renderPose (interpolation across a crossing)', () => {
  const d = door('N', 'E');
  const crossing = { fromRoom: 'r00', fromFrame: d.frame, toFrame: d.targetFrame };

  /** A pose at door-local (x, z) of `f`, walking straight through it. */
  const poseAt = (f: DoorFrame, x: number, z: number): Pose => ({
    ...fromDoorLocal(f, x, z),
    yaw: 0,
    pitch: 0,
    vx: 0,
    vz: 0,
  });

  it('keeps the current room when no crossing happened in the last step', () => {
    const p = poseAt(d.targetFrame, 0, -0.02);
    expect(renderPose(p, 'r01', null)).toEqual({ room: 'r01', pose: p });
  });

  it('keeps the new room once the interpolated eye is inside it', () => {
    const p = poseAt(d.targetFrame, 0.1, 0.01);
    expect(renderPose(p, 'r01', crossing).room).toBe('r01');
  });

  it('renders from the previous room while the interpolated eye is still behind the arrival door', () => {
    // After the crossing step both poses are in the new room; between them the eye is still
    // on the old side (arrival-door-local z < 0), i.e. outside the new room.
    const p = poseAt(d.targetFrame, 0.1, -0.02);
    const out = renderPose(p, 'r01', crossing);
    expect(out.room).toBe('r00');
    const local = toDoorLocal(d.frame, out.pose.x, out.pose.z);
    expect(local.z).toBeCloseTo(0.02, 9); // in front of the old door, inside the old room
    expect(local.x).toBeCloseTo(-0.1, 9);
  });
});

describe('keepEyeOffPortals', () => {
  const f = doorFrame(roomA, { wall: 'S', offset: 0.4 });
  const at = (x: number, z: number) => fromDoorLocal(f, x, z);

  it('moves an eye within 1 cm of a portal plane (inside the opening) to 1 cm', () => {
    for (const z of [0, 0.004, -1e-9]) {
      const p = at(0.2, z);
      const out = keepEyeOffPortals(p.x, p.z, [f]);
      const l = toDoorLocal(f, out.x, out.z);
      expect(l.z).toBeCloseTo(MIN_PORTAL_EYE_DISTANCE, 12);
      expect(l.x).toBeCloseTo(0.2, 12);
    }
  });

  it('leaves the eye alone further away or beside the opening', () => {
    for (const [x, z] of [
      [0.2, 0.05],
      [0.8, 0.002],
    ] as const) {
      const p = at(x, z);
      expect(keepEyeOffPortals(p.x, p.z, [f])).toEqual(p);
    }
  });
});
