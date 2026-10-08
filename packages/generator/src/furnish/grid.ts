/**
 * Occupancy grid of one room for the furniture placer (CP05 T3, T4). Integer cells of 0.25 m:
 * cell (i, j) covers x ∈ [i, i + 1), z ∈ [j, j + 1) grid units from the room's north-west
 * corner. The room is W × D cells (W = width in units).
 */
import type { Wall } from '@ogm/shared';

/** A rectangle of cells: x0…x0 + w − 1, z0…z0 + d − 1. */
export interface Rect {
  x0: number;
  z0: number;
  w: number;
  d: number;
}

/** Cell flags. */
export const BLOCK = 1;
/** Reserved zone: door clearance, spawn or goal (only rugs and wall-hung items). */
export const RESERVED = 2;
/** Front clearance of a placed item (no blocking footprint may cover it). */
export const CLEAR = 4;
/** A rug lies here. */
export const FLAT = 8;

/** A door of the room being furnished, in grid units (offset as in `DoorDTO`, × 4). */
export interface UnitDoor {
  wall: Wall;
  offset: number;
}

/** Reserved zones of a room. */
export interface Zones {
  /** One rectangle per door, in door order. */
  doors: Rect[];
  spawn: Rect | null;
  goal: Rect | null;
}

/** Centre of a door along its wall, in cells from the room's west (N/S) or north (E/W) edge. */
export function doorCentre(W: number, D: number, door: UnitDoor): number {
  switch (door.wall) {
    case 'N':
      return W / 2 + door.offset;
    case 'S':
      return W / 2 - door.offset;
    case 'E':
      return D / 2 + door.offset;
    case 'W':
      return D / 2 - door.offset;
  }
}

/** Door clearance depth in cells: 1.2 m = 4.8 units, rounded up to whole cells. */
export const DOOR_ZONE_DEPTH = 5;
/** Half the door clearance width in cells: 1.4 m = 5.6 units → cells c − 3 … c + 2. */
export const DOOR_ZONE_HALF = 3;
/** Spawn zone size in cells (CP05 T3). */
export const SPAWN_ZONE = 4;
/** Goal zone size in cells (CP05 T3). */
export const GOAL_ZONE = 6;

/**
 * Reserved zones (CP05 T3). A door clearance is 1.4 m wide, centred on the door, and 1.2 m
 * deep; it covers every cell the rectangle touches (6 × 5 cells), clipped to the room.
 */
export function reservedZones(
  W: number,
  D: number,
  doors: readonly UnitDoor[],
  isStart: boolean,
  isGoal: boolean,
): Zones {
  const clip = (r: Rect): Rect => {
    const x0 = Math.max(0, r.x0);
    const z0 = Math.max(0, r.z0);
    const x1 = Math.min(W, r.x0 + r.w);
    const z1 = Math.min(D, r.z0 + r.d);
    return { x0, z0, w: x1 - x0, d: z1 - z0 };
  };
  const doorZones = doors.map((door) => {
    const c = doorCentre(W, D, door);
    const a = c - DOOR_ZONE_HALF;
    const span = 2 * DOOR_ZONE_HALF;
    switch (door.wall) {
      case 'N':
        return clip({ x0: a, z0: 0, w: span, d: DOOR_ZONE_DEPTH });
      case 'S':
        return clip({ x0: a, z0: D - DOOR_ZONE_DEPTH, w: span, d: DOOR_ZONE_DEPTH });
      case 'W':
        return clip({ x0: 0, z0: a, w: DOOR_ZONE_DEPTH, d: span });
      case 'E':
        return clip({ x0: W - DOOR_ZONE_DEPTH, z0: a, w: DOOR_ZONE_DEPTH, d: span });
    }
  });
  const centred = (n: number): Rect => ({ x0: W / 2 - n / 2, z0: D / 2 - n / 2, w: n, d: n });
  return {
    doors: doorZones,
    spawn: isStart ? centred(SPAWN_ZONE) : null,
    goal: isGoal ? centred(GOAL_ZONE) : null,
  };
}

/** All zones as a list: spawn, goal, then doors (the walkability seed is the first). */
export function zoneList(z: Zones): Rect[] {
  return [...(z.spawn ? [z.spawn] : []), ...(z.goal ? [z.goal] : []), ...z.doors];
}

/** Cell flags of a room. */
export class RoomGrid {
  readonly cells: Uint8Array;

  constructor(
    readonly W: number,
    readonly D: number,
  ) {
    this.cells = new Uint8Array(W * D);
  }

  /** True when the rectangle lies inside the room. */
  inside(r: Rect): boolean {
    return (
      r.x0 >= 0 && r.z0 >= 0 && r.w > 0 && r.d > 0 && r.x0 + r.w <= this.W && r.z0 + r.d <= this.D
    );
  }

  /** Sets a flag on every cell of the rectangle (clipped to the room). */
  mark(r: Rect, flag: number): void {
    for (let z = Math.max(0, r.z0); z < Math.min(this.D, r.z0 + r.d); z++) {
      for (let x = Math.max(0, r.x0); x < Math.min(this.W, r.x0 + r.w); x++) {
        // Index is inside the array: 0 ≤ x < W, 0 ≤ z < D.
        this.cells[z * this.W + x] = (this.cells[z * this.W + x] as number) | flag;
      }
    }
  }

  /** True when no cell of the rectangle has any of the flags (the rectangle must be inside). */
  free(r: Rect, flags: number): boolean {
    for (let z = r.z0; z < r.z0 + r.d; z++) {
      for (let x = r.x0; x < r.x0 + r.w; x++) {
        if (((this.cells[z * this.W + x] as number) & flags) !== 0) return false;
      }
    }
    return true;
  }

  /**
   * Walkability (CP05 T4 step 6) with an optional extra blocking rectangle: blocking cells and
   * the wall ring are inflated by one cell (8-neighbourhood); every free cell of every zone
   * must be reachable (4-connected) from the first zone, and every zone needs a free cell.
   */
  walkable(zones: readonly Rect[], extra: Rect | null = null): boolean {
    const { W, D } = this;
    // Solid cells, then a separable 3 × 3 dilation (rows, then columns) = inflation by 1.
    const solid = new Uint8Array(W * D);
    for (let i = 0; i < W * D; i++) solid[i] = (this.cells[i] as number) & BLOCK;
    if (extra !== null) {
      for (let z = extra.z0; z < extra.z0 + extra.d; z++) {
        solid.fill(1, z * W + extra.x0, z * W + extra.x0 + extra.w);
      }
    }
    const rows = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) {
      const o = z * W;
      for (let x = 0; x < W; x++) {
        rows[o + x] =
          (solid[o + x] as number) |
          (x > 0 ? (solid[o + x - 1] as number) : 0) |
          (x < W - 1 ? (solid[o + x + 1] as number) : 0);
      }
    }
    const blocked = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const c = z * W + x;
        const ring = x === 0 || z === 0 || x === W - 1 || z === D - 1 ? 1 : 0;
        blocked[c] =
          ring |
          (rows[c] as number) |
          (z > 0 ? (rows[c - W] as number) : 0) |
          (z < D - 1 ? (rows[c + W] as number) : 0);
      }
    }
    return zonesConnected(blocked, W, D, zones);
  }
}

/** Flood fill from the first zone; true when every zone's free cells are all reached. */
function zonesConnected(
  blocked: Uint8Array,
  W: number,
  D: number,
  zones: readonly Rect[],
): boolean {
  const first = zones[0];
  if (first === undefined) return true;
  let seed = -1;
  for (let z = first.z0; z < first.z0 + first.d && seed < 0; z++) {
    for (let x = first.x0; x < first.x0 + first.w; x++) {
      if (blocked[z * W + x] === 0) {
        seed = z * W + x;
        break;
      }
    }
  }
  if (seed < 0) return false;
  const seen = new Uint8Array(W * D);
  const queue = new Int32Array(W * D);
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  seen[seed] = 1;
  // The wall ring is always blocked, so a free cell's 4 neighbours are inside the room.
  const visit = (n: number): void => {
    if (seen[n] === 1 || blocked[n] === 1) return;
    seen[n] = 1;
    queue[tail++] = n;
  };
  while (head < tail) {
    // `head` < `tail` ≤ W·D: the entry exists.
    const c = queue[head++] as number;
    visit(c - 1);
    visit(c + 1);
    visit(c - W);
    visit(c + W);
  }
  for (const r of zones) {
    let any = false;
    for (let z = r.z0; z < r.z0 + r.d; z++) {
      for (let x = r.x0; x < r.x0 + r.w; x++) {
        const c = z * W + x;
        if (blocked[c] === 1) continue;
        if (seen[c] === 0) return false;
        any = true;
      }
    }
    if (!any) return false;
  }
  return true;
}
