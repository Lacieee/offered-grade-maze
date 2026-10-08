/**
 * Difficulty metrics of a finished level (CP04 T5). Uses only the level itself, so the
 * validator can recompute them independently of the topology code.
 */
import { distancesFrom, distancesTo, type RoomDTO, type RoomId } from '@ogm/shared';
import type { LevelMetrics } from '../types.js';

/** What the metrics need from a level. */
export interface MetricsInput {
  rooms: readonly RoomDTO[];
  startRoom: RoomId;
  goalRoom: RoomId;
  depth: Readonly<Record<RoomId, number>>;
  spine: readonly RoomId[];
  twinOf: Readonly<Record<RoomId, RoomId | null>>;
}

/** Computes the metrics of a level. */
export function computeMetrics(level: MetricsInput): LevelMetrics {
  const byId = new Map(level.rooms.map((r) => [r.id, r]));
  let doors = 0;
  let links = 0;
  let asymmetric = 0;
  let selfLinks = 0;
  let sealedDoors = 0;
  let longBackLinks = 0;

  for (const room of level.rooms) {
    for (const door of room.doors) {
      doors++;
      const link = door.link;
      if (link === null) {
        sealedDoors++;
        continue;
      }
      links++;
      if (link.room === room.id) selfLinks++;
      const back = byId.get(link.room)?.doors.find((d) => d.id === link.door)?.link ?? null;
      // A sealed or missing target door counts as asymmetric.
      if (back?.room !== room.id || back.door !== door.id) asymmetric++;
      const ds = level.depth[room.id];
      const dt = level.depth[link.room];
      if (ds !== undefined && dt !== undefined && dt <= ds - 3) longBackLinks++;
    }
  }

  const fromStart = distancesFrom(level.rooms, level.startRoom);
  const toGoal = distancesTo(level.rooms, level.goalRoom);
  let misleadingDoors = 0;
  for (const id of level.spine) {
    if (id === level.goalRoom) continue;
    const own = toGoal.get(id) ?? Number.POSITIVE_INFINITY;
    for (const door of byId.get(id)?.doors ?? []) {
      if (door.link === null) continue;
      const via = toGoal.get(door.link.room) ?? Number.POSITIVE_INFINITY;
      if (via >= own) misleadingDoors++;
    }
  }

  return {
    rooms: level.rooms.length,
    doors,
    links,
    shortest: fromStart.get(level.goalRoom) ?? -1,
    // Integer division: floor(asymmetric · 1000 / links).
    asymmetricShare: links === 0 ? 0 : Math.floor((asymmetric * 1000) / links),
    selfLinks,
    sealedDoors,
    longBackLinks,
    twins: Object.values(level.twinOf).filter((t) => t !== null).length,
    misleadingDoors,
  };
}
