import { DOOR_HEIGHT, EYE_HEIGHT, WALLS, doorFrame, type DoorFrame, type Wall } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { forwardVector } from '../player/physics.js';
import { fromDoorLocal, toDoorLocal } from './portalMath.js';
import { crossPose, findCrossing, type CrossableDoor, type Pose } from './traversal.js';

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
