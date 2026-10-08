/**
 * Furniture checks of the validator (CP05 T7): V7 (placement rules), V8 (walkability) and
 * V11 (lights). Independent of `src/furnish/`: zones come from `doorFrame` and the shared
 * clearance constants, and the walkability flood fill is written separately.
 */
import {
  DOOR_CLEARANCE_D,
  DOOR_CLEARANCE_W,
  GRID,
  PAINTING_PATTERNS,
  PAINTING_SEED_MAX,
  PREFABS,
  doorFrame,
  prefabAllowedIn,
  rotatedFootprint,
  type FurnitureDTO,
  type RoomDTO,
} from '@ogm/shared';
import type { CheckId } from '../types.js';

/** Spawn zone side (m): 4 cells. */
const SPAWN_ZONE_M = 1.0;
/** Goal zone side (m): 6 cells. */
const GOAL_ZONE_M = 1.5;
const EPS = 1e-9;

type Add = (check: CheckId, message: string, room?: string) => void;

/** Cell rectangle [x0, x1) × [z0, z1). */
interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const overlap = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

/** Cells covered by a metre rectangle (every cell it touches), clipped to the room. */
function cellsOf(room: RoomDTO, minX: number, maxX: number, minZ: number, maxZ: number): Box {
  const W = Math.round(room.width / GRID);
  const D = Math.round(room.depth / GRID);
  const toCellX = (m: number): number => (m + room.width / 2) / GRID;
  const toCellZ = (m: number): number => (m + room.depth / 2) / GRID;
  return {
    x0: Math.max(0, Math.floor(toCellX(minX) + EPS)),
    x1: Math.min(W, Math.ceil(toCellX(maxX) - EPS)),
    z0: Math.max(0, Math.floor(toCellZ(minZ) + EPS)),
    z1: Math.min(D, Math.ceil(toCellZ(maxZ) - EPS)),
  };
}

/** Reserved zones of a room (CP05 T3), recomputed from the DTO. */
export function zonesOf(room: RoomDTO, isStart: boolean, isGoal: boolean): Box[] {
  const zones: Box[] = [];
  const centred = (side: number): Box => cellsOf(room, -side / 2, side / 2, -side / 2, side / 2);
  if (isStart) zones.push(centred(SPAWN_ZONE_M));
  if (isGoal) zones.push(centred(GOAL_ZONE_M));
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const half = DOOR_CLEARANCE_W / 2;
  for (const door of room.doors) {
    const o = doorFrame(room, door).origin;
    switch (door.wall) {
      case 'N':
        zones.push(cellsOf(room, o.x - half, o.x + half, -hd, -hd + DOOR_CLEARANCE_D));
        break;
      case 'S':
        zones.push(cellsOf(room, o.x - half, o.x + half, hd - DOOR_CLEARANCE_D, hd));
        break;
      case 'W':
        zones.push(cellsOf(room, -hw, -hw + DOOR_CLEARANCE_D, o.z - half, o.z + half));
        break;
      case 'E':
        zones.push(cellsOf(room, hw - DOOR_CLEARANCE_D, hw, o.z - half, o.z + half));
        break;
    }
  }
  return zones;
}

/** An item's exact cell rectangle, or null when it is off the grid or has a bad variant. */
export function itemCells(room: RoomDTO, f: FurnitureDTO): Box | null {
  if (f.variant >= PREFABS[f.prefab].footprint.length) return null;
  const { w, d } = rotatedFootprint(f.prefab, f.variant, f.rot);
  const x0 = (f.x + room.width / 2) / GRID - w / 2;
  const z0 = (f.z + room.depth / 2) / GRID - d / 2;
  if (Math.abs(x0 - Math.round(x0)) > EPS || Math.abs(z0 - Math.round(z0)) > EPS) return null;
  return { x0: Math.round(x0), x1: Math.round(x0) + w, z0: Math.round(z0), z1: Math.round(z0) + d };
}

/** V7 for one room (except house-wide signature uniqueness). */
export function checkRoomFurniture(
  room: RoomDTO,
  isStart: boolean,
  isGoal: boolean,
  add: Add,
): void {
  const W = Math.round(room.width / GRID);
  const D = Math.round(room.depth / GRID);
  const zones = zonesOf(room, isStart, isGoal);
  const blocking: { id: string; box: Box }[] = [];
  let signatures = 0;
  for (const f of room.furniture) {
    const meta = PREFABS[f.prefab];
    const name = `${room.id}.${f.id} (${f.prefab})`;
    if (!prefabAllowedIn(f.prefab, room.type))
      add('V7', `${name} is not allowed in a ${room.type}`, room.id);
    if (f.colors.length !== meta.colorSlots) {
      add('V7', `${name} has ${f.colors.length} colours, expected ${meta.colorSlots}`, room.id);
    }
    if ((f.signature === true) !== (meta.role === 'signature')) {
      add('V7', `${name}: signature flag does not match the prefab role`, room.id);
    }
    if (f.signature === true) signatures++;
    if (f.prefab === 'painting' || f.prefab === 'sig_painting') {
      const pattern = f.params?.pattern;
      const seed = f.params?.seed;
      const okPattern =
        typeof pattern === 'string' && (PAINTING_PATTERNS as readonly string[]).includes(pattern);
      const okSeed =
        typeof seed === 'number' &&
        Number.isInteger(seed) &&
        seed >= 0 &&
        seed <= PAINTING_SEED_MAX;
      if (!okPattern || !okSeed) add('V7', `${name} has invalid painting params`, room.id);
    }
    const box = itemCells(room, f);
    if (box === null) {
      add('V7', `${name} is off the 0.25 m grid or has an unknown variant`, room.id);
      continue;
    }
    if (box.x0 < 0 || box.z0 < 0 || box.x1 > W || box.z1 > D) {
      add('V7', `${name} is outside the footprint`, room.id);
    }
    if (!meta.blocks) continue;
    for (const other of blocking) {
      if (overlap(box, other.box)) add('V7', `${name} overlaps ${room.id}.${other.id}`, room.id);
    }
    if (zones.some((z) => overlap(box, z))) add('V7', `${name} stands in a reserved zone`, room.id);
    blocking.push({ id: f.id, box });
  }
  if (signatures !== 1) add('V7', `room ${room.id} has ${signatures} signature items`, room.id);
}

/**
 * V8 for one room: blocking items and the walls inflated by one cell; every free cell of
 * every reserved zone reachable (4-connected) from the first zone; each zone has a free cell.
 */
export function roomWalkable(room: RoomDTO, isStart: boolean, isGoal: boolean): boolean {
  const W = Math.round(room.width / GRID);
  const D = Math.round(room.depth / GRID);
  // 1 = not walkable: the wall ring, and every cell within one cell of a blocking item.
  const closed = new Uint8Array(W * D);
  for (let x = 0; x < W; x++) {
    closed[x] = 1;
    closed[(D - 1) * W + x] = 1;
  }
  for (let z = 0; z < D; z++) {
    closed[z * W] = 1;
    closed[z * W + W - 1] = 1;
  }
  for (const f of room.furniture) {
    if (!PREFABS[f.prefab].blocks) continue;
    const b = itemCells(room, f);
    if (b === null) continue;
    for (let z = Math.max(0, b.z0 - 1); z < Math.min(D, b.z1 + 1); z++) {
      closed.fill(1, z * W + Math.max(0, b.x0 - 1), z * W + Math.min(W, b.x1 + 1));
    }
  }
  const zones = zonesOf(room, isStart, isGoal);
  const first = zones[0];
  if (first === undefined) return true;
  const reached = new Uint8Array(W * D);
  const stack: number[] = [];
  for (let z = first.z0; z < first.z1 && stack.length === 0; z++) {
    for (let x = first.x0; x < first.x1; x++) {
      if (closed[z * W + x] === 0) {
        stack.push(z * W + x);
        reached[z * W + x] = 1;
        break;
      }
    }
  }
  if (stack.length === 0) return false;
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    // Open cells are never on the ring, so all four neighbours exist.
    for (const n of [c - 1, c + 1, c - W, c + W]) {
      if (closed[n] === 1 || reached[n] === 1) continue;
      reached[n] = 1;
      stack.push(n);
    }
  }
  return zones.every((zone) => {
    let open = 0;
    for (let z = zone.z0; z < zone.z1; z++) {
      for (let x = zone.x0; x < zone.x1; x++) {
        const c = z * W + x;
        if (closed[c] === 1) continue;
        if (reached[c] === 0) return false;
        open++;
      }
    }
    return open > 0;
  });
}

/** V11 for one room: at most 4 lights; a goal light in the goal room and nowhere else. */
export function checkRoomLights(room: RoomDTO, isGoal: boolean, add: Add): void {
  if (room.lights.length > 4)
    add('V11', `room ${room.id} has ${room.lights.length} lights`, room.id);
  const goalLights = room.lights.filter((l) => l.kind === 'goal').length;
  if (isGoal && goalLights !== 1)
    add('V11', `goal room ${room.id} has ${goalLights} goal lights`, room.id);
  if (!isGoal && goalLights > 0) add('V11', `room ${room.id} has a goal light`, room.id);
}

/** Uniqueness key of a signature item (prefab, colours, painting params). */
export function signatureTriple(f: FurnitureDTO): string {
  return JSON.stringify([f.prefab, f.colors, f.params?.pattern ?? null, f.params?.seed ?? null]);
}

/** V7, V8 and V11 for every room, plus house-wide signature uniqueness. */
export function checkFurniture(
  rooms: readonly RoomDTO[],
  startRoom: string,
  goalRoom: string,
  add: Add,
): void {
  const seen = new Map<string, string>();
  for (const room of rooms) {
    const isStart = room.id === startRoom;
    const isGoal = room.id === goalRoom;
    checkRoomFurniture(room, isStart, isGoal, add);
    if (!roomWalkable(room, isStart, isGoal)) {
      add('V8', `room ${room.id}: doors, spawn and goal zones are not all connected`, room.id);
    }
    checkRoomLights(room, isGoal, add);
    for (const f of room.furniture) {
      if (f.signature !== true) continue;
      const key = signatureTriple(f);
      const other = seen.get(key);
      if (other !== undefined)
        add('V7', `rooms ${other} and ${room.id} share a signature`, room.id);
      else seen.set(key, room.id);
    }
  }
}
