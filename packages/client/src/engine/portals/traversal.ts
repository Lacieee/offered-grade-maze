/**
 * Door crossing (CP03 T4). Runs after collision in every simulation step.
 *
 * A crossing happens when the eye goes from door-local z ≥ 0 to z < 0 through the opening
 * (|x| ≤ 0.5, 0 ≤ y ≤ 2.1 at the crossing point). The player is then moved into the target
 * room with T(D→E): position transformed, yaw += yawDelta, velocity rotated. The previous
 * simulation state gets the same transform, so render interpolation stays continuous.
 */
import { DOOR_HEIGHT, DOOR_WIDTH, type DoorFrame, type DoorId, type LinkDTO } from '@ogm/shared';
import { rotateXZ, toDoorLocal, transformPointXZ, yawDelta } from './portalMath.js';

/** A linked door that can be crossed: its frame and its target's frame. */
export interface CrossableDoor {
  id: DoorId;
  frame: DoorFrame;
  link: LinkDTO;
  targetFrame: DoorFrame;
}

/** The player's simulated pose. */
export interface Pose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
}

/**
 * Finds the door the eye passed through between two positions, if any.
 * `eyeY` is the eye height (the player has no vertical movement).
 */
export function findCrossing<D extends CrossableDoor>(
  before: { x: number; z: number },
  after: { x: number; z: number },
  eyeY: number,
  doors: readonly D[],
): D | null {
  if (eyeY < 0 || eyeY > DOOR_HEIGHT) return null;
  for (const door of doors) {
    const a = toDoorLocal(door.frame, before.x, before.z);
    const b = toDoorLocal(door.frame, after.x, after.z);
    if (a.z >= 0 && b.z < 0) {
      const s = a.z / (a.z - b.z);
      const x = a.x + (b.x - a.x) * s;
      if (Math.abs(x) <= DOOR_WIDTH / 2) return door;
    }
  }
  return null;
}

/** Applies T(D→E) to a pose: position, yaw and velocity (pitch is unchanged). */
export function crossPose(pose: Pose, from: DoorFrame, to: DoorFrame): Pose {
  const p = transformPointXZ(from, to, pose.x, pose.z);
  const delta = yawDelta(from, to);
  const v = rotateXZ(pose.vx, pose.vz, delta);
  return { x: p.x, z: p.z, yaw: pose.yaw + delta, pitch: pose.pitch, vx: v.x, vz: v.z };
}
