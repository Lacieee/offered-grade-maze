/**
 * Door-hop distances over room DTOs (CP08 T4): which rooms the player can reach soon.
 */
import type { RoomDTO, RoomId } from '@ogm/shared';

/** Anything that can look up a room's doors by id (a Map works). */
export interface RoomLookup {
  get(id: RoomId): Pick<RoomDTO, 'doors'> | undefined;
}

/**
 * Hop distance from `from` to every room reachable through outgoing links within `maxHops`,
 * using only the rooms in `rooms` (unknown rooms are reported but not expanded).
 */
export function hopDistances(
  rooms: RoomLookup,
  from: RoomId,
  maxHops: number,
): Map<RoomId, number> {
  const dist = new Map<RoomId, number>([[from, 0]]);
  let frontier: RoomId[] = [from];
  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    const next: RoomId[] = [];
    for (const id of frontier) {
      for (const door of rooms.get(id)?.doors ?? []) {
        const to = door.link?.room;
        if (to === undefined || dist.has(to)) continue;
        dist.set(to, hop);
        next.push(to);
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * Rooms within `maxHops` of `from` (following links of known rooms) that are not in
 * `rooms`: the ones to fetch. Sorted by id.
 */
export function missingWithin(rooms: RoomLookup, from: RoomId, maxHops: number): RoomId[] {
  return [...hopDistances(rooms, from, maxHops).keys()]
    .filter((id) => rooms.get(id) === undefined)
    .sort();
}
