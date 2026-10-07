/**
 * Player movement and collision: pure functions, no Three.js, no DOM.
 *
 * The player is a circle of radius {@link PLAYER_RADIUS} on a flat floor, simulated in the
 * current room's local coordinates (metres, +Y up, so movement happens in the XZ plane).
 *
 * Yaw convention (shared with the camera and `Spawn.yaw`): rotation about +Y in radians;
 * yaw 0 looks toward −Z (north), yaw +π/2 looks toward −X (west).
 */
import { PLAYER_RADIUS, WALK_SPEED } from '@ogm/shared';

/** Acceleration toward the wished velocity, and deceleration to rest (m/s²). */
export const ACCELERATION = 20;

/** Collision resolution iterations per simulation step. */
export const MAX_RESOLVE_ITERATIONS = 4;

/** Extra push-out distance so a resolved circle does not touch the collider again (m). */
const SKIN = 1e-6;

/** A line segment collider in room coordinates (walls, jambs, door panels). */
export interface SegmentCollider {
  kind: 'segment';
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** `portal-block` marks the temporary segment across a linked doorway (removed in CP03). */
  tag?: 'wall' | 'jamb' | 'sealed-door' | 'portal-block';
}

/** An axis-aligned rectangle collider in room coordinates (furniture). */
export interface BoxCollider {
  kind: 'box';
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export type Collider = SegmentCollider | BoxCollider;

/** Position and horizontal velocity of the player. */
export interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** Which movement keys are held. */
export interface MoveIntent {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/** A penetration: push the circle `depth` metres along the unit normal (nx, nz). */
export interface Contact {
  nx: number;
  nz: number;
  depth: number;
}

/** Unit vector the camera looks along (horizontal part) for a yaw. */
export function forwardVector(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Unit vector to the camera's right for a yaw. */
export function rightVector(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** Yaw that looks from (fromX, fromZ) toward (toX, toZ). */
export function yawToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

/**
 * Normalised wish direction from the held keys, relative to the camera heading.
 * Opposite keys cancel; diagonals have length 1. Returns (0, 0) when idle.
 */
export function wishDirection(intent: MoveIntent, yaw: number): { x: number; z: number } {
  const f = (intent.forward ? 1 : 0) - (intent.back ? 1 : 0);
  const r = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
  if (f === 0 && r === 0) return { x: 0, z: 0 };
  const fw = forwardVector(yaw);
  const rt = rightVector(yaw);
  const x = fw.x * f + rt.x * r;
  const z = fw.z * f + rt.z * r;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}

/**
 * Moves the velocity toward `wish × maxSpeed` by at most `accel × dt`. With no wish this
 * decelerates to rest: from walking speed in 3.0 / 20 = 0.15 s.
 */
export function accelerate(
  vx: number,
  vz: number,
  wish: { x: number; z: number },
  dt: number,
  maxSpeed: number = WALK_SPEED,
  accel: number = ACCELERATION,
): { vx: number; vz: number } {
  const dx = wish.x * maxSpeed - vx;
  const dz = wish.z * maxSpeed - vz;
  const dist = Math.hypot(dx, dz);
  const maxDelta = accel * dt;
  if (dist <= maxDelta + 1e-9) return { vx: wish.x * maxSpeed, vz: wish.z * maxSpeed };
  const k = maxDelta / dist;
  return { vx: vx + dx * k, vz: vz + dz * k };
}

/** Penetration of a circle into a collider, or `null` if they do not overlap. */
export function circleContact(x: number, z: number, radius: number, c: Collider): Contact | null {
  return c.kind === 'segment' ? segmentContact(x, z, radius, c) : boxContact(x, z, radius, c);
}

function segmentContact(x: number, z: number, r: number, s: SegmentCollider): Contact | null {
  const ex = s.bx - s.ax;
  const ez = s.bz - s.az;
  const len2 = ex * ex + ez * ez;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - s.ax) * ex + (z - s.az) * ez) / len2));
  const dx = x - (s.ax + ex * t);
  const dz = z - (s.az + ez * t);
  const dist = Math.hypot(dx, dz);
  if (dist >= r) return null;
  if (dist > 1e-9) return { nx: dx / dist, nz: dz / dist, depth: r - dist };
  // Centre exactly on the segment: push along the segment's left normal.
  const elen = Math.sqrt(len2) || 1;
  return { nx: -ez / elen, nz: ex / elen, depth: r };
}

function boxContact(x: number, z: number, r: number, b: BoxCollider): Contact | null {
  const inside = x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  if (inside) {
    // Push out through the nearest side.
    const options: Contact[] = [
      { nx: -1, nz: 0, depth: x - b.minX + r },
      { nx: 1, nz: 0, depth: b.maxX - x + r },
      { nx: 0, nz: -1, depth: z - b.minZ + r },
      { nx: 0, nz: 1, depth: b.maxZ - z + r },
    ];
    return options.reduce((best, o) => (o.depth < best.depth ? o : best));
  }
  const qx = Math.min(b.maxX, Math.max(b.minX, x));
  const qz = Math.min(b.maxZ, Math.max(b.minZ, z));
  const dx = x - qx;
  const dz = z - qz;
  const dist = Math.hypot(dx, dz);
  if (dist >= r) return null;
  return { nx: dx / dist, nz: dz / dist, depth: r - dist };
}

/**
 * Pushes a circle out of the colliders: up to {@link MAX_RESOLVE_ITERATIONS} times, find the
 * deepest penetration and push out along its normal. The velocity component into each
 * contact is then removed, so the body slides along walls; in a wedge it stops.
 */
export function resolveCollisions(
  body: Body,
  colliders: readonly Collider[],
  radius: number = PLAYER_RADIUS,
): Body {
  let { x, z, vx, vz } = body;
  const normals: { nx: number; nz: number }[] = [];
  for (let i = 0; i < MAX_RESOLVE_ITERATIONS; i++) {
    let deepest: Contact | null = null;
    for (const c of colliders) {
      const contact = circleContact(x, z, radius, c);
      if (contact && (!deepest || contact.depth > deepest.depth)) deepest = contact;
    }
    if (!deepest) break;
    x += deepest.nx * (deepest.depth + SKIN);
    z += deepest.nz * (deepest.depth + SKIN);
    normals.push(deepest);
  }
  // Slide: remove the velocity component into every surface touched this step. In a wedge
  // (velocity still pointing into two different surfaces) no motion is possible: stop.
  for (const n of normals) {
    const into = vx * n.nx + vz * n.nz;
    if (into < 0) {
      vx -= into * n.nx;
      vz -= into * n.nz;
    }
  }
  if (normals.some((n) => vx * n.nx + vz * n.nz < -1e-9)) {
    vx = 0;
    vz = 0;
  }
  return { x, z, vx, vz };
}

/** One fixed simulation step: accelerate, move, resolve collisions. */
export function stepBody(
  body: Body,
  intent: MoveIntent,
  yaw: number,
  dt: number,
  colliders: readonly Collider[],
  radius: number = PLAYER_RADIUS,
): Body {
  const v = accelerate(body.vx, body.vz, wishDirection(intent, yaw), dt);
  return resolveCollisions(
    { x: body.x + v.vx * dt, z: body.z + v.vz * dt, vx: v.vx, vz: v.vz },
    colliders,
    radius,
  );
}
