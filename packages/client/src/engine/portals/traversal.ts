/**
 * Door crossing (CP03 T4). Runs after collision in every simulation step.
 *
 * A crossing happens when the eye goes from door-local z ≥ 0 to z < 0 through the opening
 * (|x| ≤ 0.5, 0 ≤ y ≤ 2.1 at the crossing point). The player is then moved into the target
 * room with T(D→E): position transformed, yaw += yawDelta, velocity rotated. The previous
 * simulation state gets the same transform, so render interpolation stays continuous.
 */
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  type DoorFrame,
  type DoorId,
  type LinkDTO,
  type RoomId,
} from '@ogm/shared';
import { fromDoorLocal, rotateXZ, toDoorLocal, transformPointXZ, yawDelta } from './portalMath.js';

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

/** The crossing made in the last simulation step, if any. */
export interface LastCrossing {
  /** The room the player left. */
  fromRoom: RoomId;
  /** The door the player went through (in `fromRoom`). */
  fromFrame: DoorFrame;
  /** The door the player arrived at (in the current room). */
  toFrame: DoorFrame;
}

/**
 * Which room to render from, for an interpolated pose (in the current room's coordinates).
 *
 * Rendering interpolates between the previous and current simulation states. After a
 * crossing step both are in the new room, but between them the eye can still be on the old
 * side of the arrival door (door-local z < 0): outside the new room, inside its portal box.
 * Rendered from there, the frame shows a flat fallback colour (a one-frame glitch). Such a
 * pose is instead mapped back through the door and rendered from the room it is really in.
 */
export function renderPose(
  pose: Pose,
  room: RoomId,
  crossing: LastCrossing | null,
): { room: RoomId; pose: Pose } {
  if (!crossing) return { room, pose };
  if (toDoorLocal(crossing.toFrame, pose.x, pose.z).z >= 0) return { room, pose };
  return { room: crossing.fromRoom, pose: crossPose(pose, crossing.toFrame, crossing.fromFrame) };
}

/** Closest the rendered eye may be to a linked doorway's portal plane (m). */
export const MIN_PORTAL_EYE_DISTANCE = 0.01;

/**
 * Keeps the rendered eye at least {@link MIN_PORTAL_EYE_DISTANCE} in front of every portal
 * plane it is standing in. Within about a millimetre of the plane both sides are degenerate
 * (the portal counts as behind the camera, or its oblique clip plane lands behind the virtual
 * camera), which shows a full-screen fallback colour. The nudge is far smaller than one
 * frame of walking (2.5 cm at 120 Hz), so it is invisible. Only rendering uses it; the
 * simulation keeps the true position.
 */
export function keepEyeOffPortals(
  x: number,
  z: number,
  frames: readonly DoorFrame[],
): { x: number; z: number } {
  for (const frame of frames) {
    const local = toDoorLocal(frame, x, z);
    if (
      Math.abs(local.x) <= DOOR_WIDTH / 2 &&
      local.z > -MIN_PORTAL_EYE_DISTANCE &&
      local.z < MIN_PORTAL_EYE_DISTANCE
    ) {
      return fromDoorLocal(frame, local.x, MIN_PORTAL_EYE_DISTANCE);
    }
  }
  return { x, z };
}
