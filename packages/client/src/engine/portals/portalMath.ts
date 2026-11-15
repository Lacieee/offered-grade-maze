/**
 * Portal maths (CP03 T1).
 *
 * A link D (door of room A) → E (door of room B) maps room A's coordinates into room B's:
 *
 *     T(D→E) = M_E · R_y(π) · M_D⁻¹
 *
 * `M_X` is door X's frame matrix in its room (translation `origin`, rotation `yaw` about +Y),
 * and `R_y(π)` is a half-turn about +Y. A point just outside D (door-local z = −ε) lands just
 * inside E (door-local z = +ε). T is always a rotation about Y plus a translation, never a
 * mirror. The yaw part of T is `yawDelta(D, E) = yaw_E + π − yaw_D`.
 */
import type { DoorFrame } from '@ogm/shared';
import * as THREE from 'three';

const HALF_TURN = new THREE.Matrix4().makeRotationY(Math.PI);

/** Normalises an angle to (−π, π]. */
export function normalizeAngle(a: number): number {
  const twoPi = 2 * Math.PI;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  else if (r > Math.PI) r -= twoPi;
  return r;
}

/** Door frame matrix: door-local → room coordinates. */
export function doorMatrix(frame: DoorFrame): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(frame.yaw);
  m.setPosition(frame.origin.x, frame.origin.y, frame.origin.z);
  return m;
}

/** T(D→E) = M_E · R_y(π) · M_D⁻¹: maps the source room's coordinates to the target room's. */
export function portalTransform(fromFrame: DoorFrame, toFrame: DoorFrame): THREE.Matrix4 {
  const invFrom = doorMatrix(fromFrame).invert();
  return doorMatrix(toFrame).multiply(HALF_TURN).multiply(invFrom);
}

/** Yaw change applied by T(D→E), normalised to (−π, π]. */
export function yawDelta(fromFrame: DoorFrame, toFrame: DoorFrame): number {
  return normalizeAngle(toFrame.yaw + Math.PI - fromFrame.yaw);
}

/** Rotates the horizontal vector (x, z) about +Y by `angle` (same convention as three.js). */
export function rotateXZ(x: number, z: number, angle: number): { x: number; z: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * x + s * z, z: -s * x + c * z };
}

/** Room point (x, z) → door-local (x, z) of `frame`. */
export function toDoorLocal(frame: DoorFrame, x: number, z: number): { x: number; z: number } {
  return rotateXZ(x - frame.origin.x, z - frame.origin.z, -frame.yaw);
}

/** Door-local (x, z) of `frame` → room point. */
export function fromDoorLocal(frame: DoorFrame, x: number, z: number): { x: number; z: number } {
  const r = rotateXZ(x, z, frame.yaw);
  return { x: r.x + frame.origin.x, z: r.z + frame.origin.z };
}

/** T(D→E) applied to a horizontal point (the 2D form used by the simulation). */
export function transformPointXZ(
  fromFrame: DoorFrame,
  toFrame: DoorFrame,
  x: number,
  z: number,
): { x: number; z: number } {
  const local = toDoorLocal(fromFrame, x, z);
  return fromDoorLocal(toFrame, -local.x, -local.z);
}

/**
 * Lengyel's oblique near plane: returns a copy of `projection` whose near plane is the given
 * clip plane (in the camera's view space, normal pointing toward what stays visible). Same
 * technique as three.js `examples/jsm/objects/Reflector.js`. Only the third row changes, so
 * x, y and w of projected points (and screen positions) are unaffected.
 */
export function obliqueProjection(
  projection: THREE.Matrix4,
  clipPlaneView: THREE.Vector4,
): THREE.Matrix4 {
  const out = projection.clone();
  const e = out.elements;
  const c = clipPlaneView.clone();
  const q = new THREE.Vector4(
    (Math.sign(c.x) + e[8]) / e[0],
    (Math.sign(c.y) + e[9]) / e[5],
    -1,
    (1 + e[10]) / e[14],
  );
  c.multiplyScalar(2 / c.dot(q));
  e[2] = c.x;
  e[6] = c.y;
  e[10] = c.z + 1;
  e[14] = c.w;
  return out;
}

/** Offset of the oblique clip plane from the arrival door plane, toward the camera (m). */
export const CLIP_PLANE_OFFSET = 0.001;

/**
 * The clip plane for a virtual camera that looks into a room through its arrival door:
 * the door's plane moved 1 mm toward the camera (door-local z = −0.001), normal = the door's
 * inward direction, expressed in the camera's view space.
 */
export function arrivalClipPlane(
  arrival: DoorFrame,
  cameraWorldInverse: THREE.Matrix4,
): THREE.Vector4 {
  const normal = new THREE.Vector3(arrival.inward.x, 0, arrival.inward.z);
  const point = new THREE.Vector3(
    arrival.origin.x - arrival.inward.x * CLIP_PLANE_OFFSET,
    arrival.origin.y,
    arrival.origin.z - arrival.inward.z * CLIP_PLANE_OFFSET,
  );
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  plane.applyMatrix4(cameraWorldInverse);
  return new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
}
