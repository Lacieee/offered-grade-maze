/**
 * Rooms streamed ahead of the player (CP07 T3).
 */
import type { GraphRoom, RoomId } from '@ogm/shared';

/**
 * Every room reachable from `roomId` by following outgoing links within `radius` door hops,
 * including `roomId` itself, sorted by id. An unknown room gives `[]`.
 */
export function neighbourhood(
  level: { rooms: readonly GraphRoom[] },
  roomId: RoomId,
  radius: number,
): RoomId[] {
  const byId = new Map(level.rooms.map((r) => [r.id, r]));
  if (!byId.has(roomId)) return [];
  const seen = new Set<RoomId>([roomId]);
  let frontier: RoomId[] = [roomId];
  for (let hop = 0; hop < radius && frontier.length > 0; hop++) {
    const next: RoomId[] = [];
    for (const id of frontier) {
      for (const door of byId.get(id)?.doors ?? []) {
        const to = door.link?.room;
        if (to !== undefined && !seen.has(to)) {
          seen.add(to);
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  return [...seen].sort();
}
