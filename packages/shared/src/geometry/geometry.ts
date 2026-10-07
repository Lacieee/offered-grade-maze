/**
 * Room geometry shared by client, server and generator.
 *
 * Units are metres. Room coordinates are right-handed, +Y up, origin at the centre of
 * the floor. Interior footprint: x ∈ [−w/2, +w/2], z ∈ [−d/2, +d/2].
 * Walls: N at z = −d/2, S at z = +d/2, W at x = −w/2, E at x = +w/2.
 *
 * Door frames are computed only here, so client and server can never disagree.
 */

/** Generator grid cell size (m). */
export const GRID = 0.25;
/** Floor-to-ceiling height (m). */
export const ROOM_HEIGHT = 2.8;
/** Width of every doorway (m). */
export const DOOR_WIDTH = 1.0;
/** Height of every doorway (m). */
export const DOOR_HEIGHT = 2.1;
/** Wall thickness owned by each room, outside its footprint (m). */
export const WALL_HALF = 0.15;
/** Minimum distance from a door edge to a room corner (m). */
export const DOOR_CORNER_MARGIN = 0.5;
/** Minimum distance between two doors on one wall (m). */
export const DOOR_SPACING = 0.6;
/** Width of the clearance zone in front of a door (m). */
export const DOOR_CLEARANCE_W = 1.4;
/** Depth of the clearance zone in front of a door (m). */
export const DOOR_CLEARANCE_D = 1.2;
/** Depth of the portal mesh behind the portal plane (m). */
export const PORTAL_BOX_DEPTH = 0.25;
/** Camera (eye) height above the floor (m). */
export const EYE_HEIGHT = 1.65;
/** Player collision circle radius (m). */
export const PLAYER_RADIUS = 0.3;
/** Walking speed (m/s). */
export const WALK_SPEED = 3.0;

/** A wall of a rectangular room. */
export type Wall = 'N' | 'E' | 'S' | 'W';

/** All walls, clockwise from north. */
export const WALLS = ['N', 'E', 'S', 'W'] as const satisfies readonly Wall[];

/** A horizontal unit vector in room coordinates. */
export interface Vec2XZ {
  x: number;
  z: number;
}

/** A point in room coordinates. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Room size as needed for door geometry. */
export interface RoomSize {
  /** Interior size along X (m). */
  width: number;
  /** Interior size along Z (m). */
  depth: number;
}

/** A door's position as stored in a room. */
export interface DoorPlacement {
  wall: Wall;
  /** Signed distance (m) from the wall centre to the door centre, along the door's local +X. */
  offset: number;
}

/**
 * A door's local frame in its room's coordinates.
 *
 * Local +Z points into the room, +Y up, +X = Y × Z. A rotation by θ about +Y maps local +X
 * to (cos θ, 0, −sin θ) and local +Z to (sin θ, 0, cos θ).
 */
export interface DoorFrame {
  /** Bottom centre of the opening, on the portal plane. */
  origin: Vec3;
  /** Rotation about +Y (radians). */
  yaw: number;
  /** Local +Z (inward normal) in room coordinates. */
  inward: Vec2XZ;
  /** Local +X in room coordinates. */
  right: Vec2XZ;
}

interface WallBasis {
  yaw: number;
  inward: Vec2XZ;
  right: Vec2XZ;
}

/** Exact per-wall frame values (the contract of CP01 T4). */
const WALL_BASIS: Readonly<Record<Wall, WallBasis>> = {
  N: { yaw: 0, inward: { x: 0, z: 1 }, right: { x: 1, z: 0 } },
  S: { yaw: Math.PI, inward: { x: 0, z: -1 }, right: { x: -1, z: 0 } },
  E: { yaw: -Math.PI / 2, inward: { x: -1, z: 0 }, right: { x: 0, z: 1 } },
  W: { yaw: Math.PI / 2, inward: { x: 1, z: 0 }, right: { x: 0, z: -1 } },
};

/** Length (m) of a wall's interior side: N and S span the width, E and W the depth. */
export function wallLength(room: RoomSize, wall: Wall): number {
  return wall === 'N' || wall === 'S' ? room.width : room.depth;
}

/**
 * Largest allowed |offset| (m) for a door on `wall`, keeping the door edge at least
 * {@link DOOR_CORNER_MARGIN} from each corner. Negative if the wall is too short for a door.
 */
export function maxDoorOffset(room: RoomSize, wall: Wall): number {
  return wallLength(room, wall) / 2 - DOOR_WIDTH / 2 - DOOR_CORNER_MARGIN;
}

/**
 * Computes a door's local frame in its room's coordinates.
 *
 * The origin is the bottom centre of the opening on the portal plane, which is the wall
 * line pushed outward by {@link WALL_HALF}.
 */
export function doorFrame(room: RoomSize, door: DoorPlacement): DoorFrame {
  const basis = WALL_BASIS[door.wall];
  const halfW = room.width / 2 + WALL_HALF;
  const halfD = room.depth / 2 + WALL_HALF;
  // Origin = outward wall centre + offset · right. Written per wall to stay exact (no −0).
  let origin: Vec3;
  switch (door.wall) {
    case 'N':
      origin = { x: door.offset, y: 0, z: -halfD };
      break;
    case 'S':
      origin = { x: 0 - door.offset, y: 0, z: halfD };
      break;
    case 'E':
      origin = { x: halfW, y: 0, z: door.offset };
      break;
    case 'W':
      origin = { x: -halfW, y: 0, z: 0 - door.offset };
      break;
  }
  return {
    origin,
    yaw: basis.yaw,
    inward: { ...basis.inward },
    right: { ...basis.right },
  };
}
