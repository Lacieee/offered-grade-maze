/**
 * The house as a directed multigraph: rooms are vertices, links are edges (sealed doors add
 * no edge). Breadth-first searches shared by the generator's validator, the server (CP07)
 * and the debug view (CP10).
 *
 * Every search is deterministic: rooms are expanded in BFS order and each room's doors in
 * door-id order, so the first discovery of a room always wins.
 */
import type { DoorId, PathStep, RoomId } from '../dto/dto.js';

/** The part of a room the graph searches need. */
export interface GraphRoom {
  id: RoomId;
  doors: { id: DoorId; link: { room: RoomId; door: DoorId } | null }[];
}

/** Door ids compare as plain strings (`d0` < `d1` < … < `d9`). */
function byDoorId<T extends { id: DoorId }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Rooms by id, each with its doors sorted by id. */
function index(rooms: readonly GraphRoom[]): Map<RoomId, GraphRoom['doors']> {
  const out = new Map<RoomId, GraphRoom['doors']>();
  for (const r of rooms) out.set(r.id, [...r.doors].sort(byDoorId));
  return out;
}

/**
 * Shortest door-level path from `from` to `to`, or `null` if `to` is unreachable (or either
 * room does not exist).
 *
 * The first step has `arriveDoor = null`; the last step (room `to`) has `exitDoor = null`.
 * When `from === to` the path is a single step with both doors `null`. Ties are broken by
 * BFS order, then door id: the first discovery of a room wins.
 */
export function shortestPath(
  rooms: readonly GraphRoom[],
  from: RoomId,
  to: RoomId,
): PathStep[] | null {
  const byId = index(rooms);
  if (!byId.has(from) || !byId.has(to)) return null;

  /** How each room was first reached: previous room, its exit door, our arrival door. */
  const via = new Map<RoomId, { prev: RoomId; exit: DoorId; arrive: DoorId } | null>();
  via.set(from, null);
  const queue: RoomId[] = [from];
  for (let head = 0; head < queue.length && !via.has(to); head++) {
    // `head` is within the queue by the loop condition.
    const room = queue[head] as RoomId;
    for (const door of byId.get(room) ?? []) {
      const link = door.link;
      if (link === null || via.has(link.room) || !byId.has(link.room)) continue;
      via.set(link.room, { prev: room, exit: door.id, arrive: link.door });
      queue.push(link.room);
    }
  }
  if (!via.has(to)) return null;

  const steps: PathStep[] = [];
  let room = to;
  let exitDoor: DoorId | null = null;
  for (;;) {
    const v = via.get(room);
    if (v === undefined || v === null) {
      steps.push({ room, arriveDoor: null, exitDoor });
      break;
    }
    steps.push({ room, arriveDoor: v.arrive, exitDoor });
    exitDoor = v.exit;
    room = v.prev;
  }
  return steps.reverse();
}

/**
 * Door-distance from `from` to every room it can reach (BFS over links). Unreachable rooms
 * are absent from the map. An unknown `from` gives an empty map.
 */
export function distancesFrom(rooms: readonly GraphRoom[], from: RoomId): Map<RoomId, number> {
  const byId = index(rooms);
  const dist = new Map<RoomId, number>();
  if (!byId.has(from)) return dist;
  dist.set(from, 0);
  const queue: RoomId[] = [from];
  for (let head = 0; head < queue.length; head++) {
    // `head` is within the queue, and every queued room has a distance.
    const room = queue[head] as RoomId;
    const d = dist.get(room) as number;
    for (const door of byId.get(room) ?? []) {
      const link = door.link;
      if (link === null || dist.has(link.room) || !byId.has(link.room)) continue;
      dist.set(link.room, d + 1);
      queue.push(link.room);
    }
  }
  return dist;
}

/**
 * Door-distance from every room that can reach `to` (BFS over reversed links). Rooms that
 * cannot reach `to` are absent from the map. An unknown `to` gives an empty map.
 */
export function distancesTo(rooms: readonly GraphRoom[], to: RoomId): Map<RoomId, number> {
  const ids = new Set(rooms.map((r) => r.id));
  /** Reversed adjacency: target room → source rooms, in room order then door order. */
  const incoming = new Map<RoomId, RoomId[]>();
  const sorted = [...rooms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of sorted) {
    for (const door of [...r.doors].sort(byDoorId)) {
      if (door.link === null || !ids.has(door.link.room)) continue;
      const list = incoming.get(door.link.room) ?? [];
      list.push(r.id);
      incoming.set(door.link.room, list);
    }
  }
  const dist = new Map<RoomId, number>();
  if (!ids.has(to)) return dist;
  dist.set(to, 0);
  const queue: RoomId[] = [to];
  for (let head = 0; head < queue.length; head++) {
    // `head` is within the queue, and every queued room has a distance.
    const room = queue[head] as RoomId;
    const d = dist.get(room) as number;
    for (const src of incoming.get(room) ?? []) {
      if (dist.has(src)) continue;
      dist.set(src, d + 1);
      queue.push(src);
    }
  }
  return dist;
}
