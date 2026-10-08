/**
 * Step 12: shuffle room ids, convert units to metres and build the `Level`.
 */
import {
  ROOM_HEIGHT,
  type Difficulty,
  type DoorDTO,
  type PaletteDTO,
  type RoomDTO,
  type RoomId,
  type Spawn,
  type Wall,
} from '@ogm/shared';
import { ROOM_TYPES, roomLabel } from '../difficulty/table.js';
import { levelHash } from '../hash/canonical.js';
import { computeMetrics } from '../metrics/metrics.js';
import type { Sfc32 } from '../prng/index.js';
import { GENERATOR_VERSION, type Level } from '../types.js';
import type { Draft } from './model.js';

/** Neutral grey palette until CP05 adds palettes. */
export const NEUTRAL_PALETTE: PaletteDTO = {
  wall: '#c8c8c8',
  floor: '#8c8c8c',
  trim: '#e6e6e6',
  ceiling: '#f0f0f0',
};

/** The single ceiling light of CP04. */
export const CEILING_LIGHT = {
  kind: 'ceiling',
  x: 0,
  y: 2.6,
  z: 0,
  color: '#fff2dd',
  intensity: 1,
} as const;

/** Goal object position in the goal room (CP05 reserves a zone for it). */
export const GOAL_POSITION = { x: 0, y: 1.2, z: 0 } as const;

/**
 * Camera yaw that faces a wall squarely (yaw 0 looks toward −Z, +π/2 toward −X). Exact
 * constants, so no trigonometry is needed (ADR-0005).
 */
export const YAW_FACING: Readonly<Record<Wall, number>> = {
  N: 0,
  S: Math.PI,
  E: -Math.PI / 2,
  W: Math.PI / 2,
};

/** Room id `r00`…`r99`. */
function roomId(n: number): RoomId {
  return `r${String(n).padStart(2, '0')}`;
}

/** Grid units to metres (exact: division by a power of two). */
function metres(units: number): number {
  return units / 4 + 0;
}

/** Builds the finished level from a complete draft. `meta.attempts` is set by the caller. */
export function finalise(
  rng: Sfc32,
  draft: Draft,
  seed: string,
  difficulty: Difficulty,
  attempt: number,
): Level {
  const N = draft.rooms.length;
  // permutation[i] = new number of temporary room i.
  const permutation = rng.shuffle(Array.from({ length: N }, (_, i) => i));
  const idOf = (idx: number): RoomId => roomId(permutation[idx] ?? -1);
  const L = draft.L;

  const rooms: RoomDTO[] = draft.rooms.map((r) => {
    const doors: DoorDTO[] = r.doors.map((d) => ({
      id: `d${d.id}`,
      wall: d.wall,
      offset: metres(d.offset),
      link: d.link === null ? null : { room: idOf(d.link.room), door: `d${d.link.door}` },
    }));
    const room: RoomDTO = {
      id: idOf(r.idx),
      type: r.type,
      label: roomLabel(r.type),
      width: metres(r.widthU),
      depth: metres(r.depthU),
      height: ROOM_HEIGHT,
      floor: ROOM_TYPES[r.type].floor,
      palette: { ...NEUTRAL_PALETTE },
      doors,
      furniture: [],
      lights: [{ ...CEILING_LIGHT }],
    };
    if (r.idx === L) room.goal = { ...GOAL_POSITION };
    return room;
  });
  rooms.sort((a, b) => (a.id < b.id ? -1 : 1));

  const start = draft.room(0);
  const firstDoor = start.doors[0];
  const spawn: Spawn = {
    x: 0,
    z: 0,
    yaw: firstDoor === undefined ? 0 : YAW_FACING[firstDoor.wall],
  };

  const depth: Record<RoomId, number> = {};
  const twinOf: Record<RoomId, RoomId | null> = {};
  const byNewId = [...draft.rooms].sort(
    (a, b) => (permutation[a.idx] ?? 0) - (permutation[b.idx] ?? 0),
  );
  for (const r of byNewId) {
    depth[idOf(r.idx)] = r.layer;
    twinOf[idOf(r.idx)] = r.twinOf === null ? null : idOf(r.twinOf);
  }
  const spine = draft.rooms.slice(0, L + 1).map((r) => idOf(r.idx));

  const base = {
    seed,
    difficulty,
    generatorVersion: GENERATOR_VERSION,
    startRoom: idOf(0),
    goalRoom: idOf(L),
    spawn,
    rooms,
  };
  const metrics = computeMetrics({ ...base, depth, spine, twinOf });
  return {
    ...base,
    meta: { depth, spine, twinOf, attempts: attempt, metrics, levelHash: levelHash(base) },
  };
}
