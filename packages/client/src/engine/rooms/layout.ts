/**
 * Room layout: turns a `RoomDTO` into wall outlines, axis-aligned boxes (for rendering) and
 * colliders. Pure functions, no Three.js, so the geometry rules are unit-tested directly.
 *
 * Door positions always come from `doorFrame()` in `@ogm/shared`; they are never re-derived.
 * Each wall is described in its own frame: `u` runs along the wall in the direction of the
 * door frames' local +X (`right`), `t` is the distance into the room from the footprint edge
 * (negative inside the wall; −WALL_HALF is the portal plane).
 */
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  WALLS,
  GRID,
  PREFABS,
  WALL_HALF,
  doorFrame,
  rotatedFootprint,
  wallLength,
  type DoorDTO,
  type DoorFrame,
  type FurnitureDTO,
  type RoomDTO,
  type Vec2XZ,
  type Wall,
} from '@ogm/shared';
import type { BoxCollider, Collider, SegmentCollider } from '../player/physics.js';

/** Door casing (trim) width on the room side (m). */
export const CASING_WIDTH = 0.08;
/** How far the casing stands proud of the wall (m). */
export const CASING_DEPTH = 0.02;
/** Thickness of a sealed door panel (m). */
export const DOOR_PANEL_THICKNESS = 0.04;
/**
 * Doorway colours (PD10). Every doorway looks the same in every room, so the two halves of a
 * doorway (one from each room) join seamlessly and a crossing is invisible.
 */
export const DOORWAY_FRAME_COLOR = '#e9e3d8';
/** Doorstep colour (PD10). */
export const DOORSTEP_COLOR = '#7b5b40';
/** Closed door panel colour (sealed doors). */
export const DOOR_PANEL_COLOR = '#ece8e0';
/** Doorstep height above the floor (m). */
export const DOORSTEP_HEIGHT = 0.012;
/** How far the doorstep reaches into the room from the footprint edge (m). */
export const DOORSTEP_LIP = 0.04;
/** Door handle colour. */
export const HANDLE_COLOR = '#3a3a3a';

/** Which material a box is drawn with. */
export type MaterialKey = 'wall' | 'floor' | 'doorframe' | 'doorstep' | 'panel' | 'handle';

/** An axis-aligned box in room coordinates. */
export interface LayoutBox {
  mat: MaterialKey;
  min: [number, number, number];
  max: [number, number, number];
  /** For doorway parts: the room axis the wall runs along (for door-relative shading). */
  along?: 'x' | 'z';
}

/** One wall's frame and its door openings. */
export interface WallLayout {
  wall: Wall;
  /** Centre of the wall's interior face, on the floor (room coordinates). */
  centre: Vec2XZ;
  /** Unit vector along the wall (`u` axis), equal to the door frames' local +X. */
  right: Vec2XZ;
  /** Unit vector into the room (`t` axis). */
  inward: Vec2XZ;
  /** Interior length of the wall (m). */
  length: number;
  /** Door openings as `[u0, u1]`, sorted. Each is DOOR_WIDTH wide and DOOR_HEIGHT high. */
  openings: [number, number][];
}

/** The rendering and collision layout of one room. */
export interface RoomLayout {
  walls: WallLayout[];
  boxes: LayoutBox[];
  /** Permanent colliders: walls, jambs, sealed doors, blocking furniture. */
  colliders: Collider[];
  /**
   * A segment across each linked opening at the portal plane. Only active while the target
   * room is not loaded, so the player can never walk out of the house (CP03, CP08 streaming).
   */
  portalBlocks: Map<string, SegmentCollider>;
  doors: { dto: DoorDTO; frame: DoorFrame }[];
}

/** Room (x, z) of the point at wall position u and depth t. */
export function wallPoint(w: WallLayout, u: number, t: number): Vec2XZ {
  return {
    x: w.centre.x + w.right.x * u + w.inward.x * t,
    z: w.centre.z + w.right.z * u + w.inward.z * t,
  };
}

/** Box spanning u ∈ [u0, u1], t ∈ [t0, t1], y ∈ [y0, y1] of a wall frame. */
function wallBox(
  w: WallLayout,
  mat: MaterialKey,
  [u0, u1]: readonly [number, number],
  [t0, t1]: readonly [number, number],
  [y0, y1]: readonly [number, number],
): LayoutBox {
  const p = wallPoint(w, u0, t0);
  const q = wallPoint(w, u1, t1);
  return {
    mat,
    min: [Math.min(p.x, q.x), y0, Math.min(p.z, q.z)],
    max: [Math.max(p.x, q.x), y1, Math.max(p.z, q.z)],
    along: Math.abs(w.right.x) > 0.5 ? 'x' : 'z',
  };
}

function segment(
  w: WallLayout,
  [u0, t0]: readonly [number, number],
  [u1, t1]: readonly [number, number],
  tag: NonNullable<SegmentCollider['tag']>,
): SegmentCollider {
  const p = wallPoint(w, u0, t0);
  const q = wallPoint(w, u1, t1);
  return { kind: 'segment', ax: p.x, az: p.z, bx: q.x, bz: q.z, tag };
}

/** Subtracts the open intervals from [from, to]; returns the solid intervals in order. */
export function solidIntervals(
  from: number,
  to: number,
  openings: readonly (readonly [number, number])[],
): [number, number][] {
  const sorted = [...openings].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let cursor = from;
  for (const [o0, o1] of sorted) {
    if (o0 > cursor) out.push([cursor, Math.min(o0, to)]);
    cursor = Math.max(cursor, o1);
  }
  if (cursor < to) out.push([cursor, to]);
  return out.filter(([a, b]) => b - a > 1e-9);
}

/** Floor rectangle and height span of a furniture item (m), from the prefab catalogue. */
export interface FurnitureBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Bottom and top above the floor: wall-hung items hang at their mount height. */
  y0: number;
  y1: number;
  /** False for rugs and wall-hung items: no collider. */
  blocks: boolean;
}

/**
 * Bounds of a furniture item after its quarter-turn rotation (axis-aligned), from the
 * catalogue footprint of its variant (an unknown variant falls back to the first).
 */
export function furnitureFootprint(f: FurnitureDTO): FurnitureBounds {
  const meta = PREFABS[f.prefab];
  const variant = f.variant < meta.footprint.length ? f.variant : 0;
  const { w, d } = rotatedFootprint(f.prefab, variant, f.rot);
  const sx = w * GRID;
  const sz = d * GRID;
  const y0 = meta.mountY === undefined ? 0 : meta.mountY - meta.height / 2;
  return {
    minX: f.x - sx / 2,
    maxX: f.x + sx / 2,
    minZ: f.z - sz / 2,
    maxZ: f.z + sz / 2,
    y0,
    y1: y0 + meta.height,
    blocks: meta.blocks,
  };
}

/** Position along a wall (u) of a room point, e.g. a door frame origin. */
export function alongWall(w: Pick<WallLayout, 'centre' | 'right'>, p: Vec2XZ): number {
  return (p.x - w.centre.x) * w.right.x + (p.z - w.centre.z) * w.right.z;
}

/** Wall frame: the frame of a door at the wall centre, moved from the portal plane to the face. */
function wallLayout(room: RoomDTO, wall: Wall, doors: RoomLayout['doors']): WallLayout {
  const f0 = doorFrame(room, { wall, offset: 0 });
  const centre = {
    x: f0.origin.x + f0.inward.x * WALL_HALF,
    z: f0.origin.z + f0.inward.z * WALL_HALF,
  };
  const openings = doors
    .filter((d) => d.dto.wall === wall)
    .map((d) => {
      const u = alongWall({ centre, right: f0.right }, d.frame.origin);
      return [u - DOOR_WIDTH / 2, u + DOOR_WIDTH / 2] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
  return {
    wall,
    centre,
    right: f0.right,
    inward: f0.inward,
    length: wallLength(room, wall),
    openings,
  };
}

/** Computes the full layout of a room. */
export function layoutRoom(room: RoomDTO): RoomLayout {
  const boxes: LayoutBox[] = [];
  const colliders: Collider[] = [];
  const portalBlocks = new Map<string, SegmentCollider>();
  const doors = room.doors.map((dto) => ({ dto, frame: doorFrame(room, dto) }));
  const walls = WALLS.map((wall) => wallLayout(room, wall, doors));

  for (const w of walls) {
    const half = w.length / 2;
    // Wall colliders along the footprint edge, with gaps at the openings.
    for (const [u0, u1] of solidIntervals(-half, half, w.openings)) {
      colliders.push(segment(w, [u0, 0], [u1, 0], 'wall'));
    }
  }

  for (const { dto: door, frame } of doors) {
    const w = walls.find((x) => x.wall === door.wall);
    if (!w) continue;
    const c = alongWall(w, frame.origin);
    const l = c - DOOR_WIDTH / 2;
    const r = c + DOOR_WIDTH / 2;

    // Doorstep: across the whole opening, from the portal plane to a lip in the room.
    boxes.push(
      wallBox(w, 'doorstep', [l, r], [-WALL_HALF, DOORSTEP_LIP], [-0.02, DOORSTEP_HEIGHT]),
    );
    // Casing on the room side: two jambs and a head.
    const top = DOOR_HEIGHT + CASING_WIDTH;
    boxes.push(wallBox(w, 'doorframe', [l - CASING_WIDTH, l], [0, CASING_DEPTH], [0, top]));
    boxes.push(wallBox(w, 'doorframe', [r, r + CASING_WIDTH], [0, CASING_DEPTH], [0, top]));
    boxes.push(
      wallBox(
        w,
        'doorframe',
        [l - CASING_WIDTH, r + CASING_WIDTH],
        [0, CASING_DEPTH],
        [DOOR_HEIGHT, top],
      ),
    );
    // Jamb colliders from the footprint edge to the portal plane.
    colliders.push(segment(w, [l, 0], [l, -WALL_HALF], 'jamb'));
    colliders.push(segment(w, [r, 0], [r, -WALL_HALF], 'jamb'));

    if (door.link === null) {
      // Sealed: a closed panel at the portal plane, with a handle on the room side.
      const t0 = -WALL_HALF;
      const t1 = t0 + DOOR_PANEL_THICKNESS;
      boxes.push(wallBox(w, 'panel', [l, r], [t0, t1], [0, DOOR_HEIGHT]));
      boxes.push(wallBox(w, 'handle', [c + 0.3, c + 0.4], [t1, t1 + 0.06], [0.95, 1.05]));
      colliders.push(segment(w, [l, t1], [r, t1], 'sealed-door'));
    } else {
      portalBlocks.set(door.id, segment(w, [l, -WALL_HALF], [r, -WALL_HALF], 'portal-block'));
    }
  }

  // Furniture geometry comes from the prefab recipes (CP06); colliders keep using the
  // catalogue footprint, never the visual mesh.
  for (const f of room.furniture) {
    const fp = furnitureFootprint(f);
    if (!fp.blocks) continue;
    const box: BoxCollider = {
      kind: 'box',
      minX: fp.minX,
      minZ: fp.minZ,
      maxX: fp.maxX,
      maxZ: fp.maxZ,
    };
    colliders.push(box);
  }

  return { walls, boxes, colliders, portalBlocks, doors };
}
