/**
 * Debug view graph layout (CP10 A2): rooms in layers by depth, left to right (start on the
 * left, goal on the right), sorted by id within a layer; links classified for drawing. Pure
 * and DOM-free, so it is unit-tested. No graph library.
 */
import type { DebugResponse, DebugRoomDTO, PathStep, RoomId } from '@ogm/shared';

/** Box width, header height, height per door row, gaps (SVG units). */
export const NODE_W = 168;
export const HEADER_H = 26;
export const ROW_H = 15;
export const GAP_X = 96;
export const GAP_Y = 28;

export interface NodeBox {
  room: DebugRoomDTO;
  x: number;
  y: number;
  w: number;
  h: number;
  /** y of each door's row (centre), by door id. */
  doorY: Map<string, number>;
}

export type LinkKind = 'reciprocal' | 'oneWay' | 'self';

export interface LinkEdge {
  kind: LinkKind;
  from: { room: RoomId; door: string };
  to: { room: RoomId; door: string };
  /** For reciprocal pairs, drawn once: the pair's two door labels. */
  label: string;
}

export interface GraphLayout {
  nodes: Map<RoomId, NodeBox>;
  edges: LinkEdge[];
  /** Sealed doors: [room, door]. */
  sealed: { room: RoomId; door: string }[];
  /** Twin → original. */
  twins: { twin: RoomId; original: RoomId }[];
  width: number;
  height: number;
}

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Lays out the house of a debug response. */
export function layoutGraph(data: Pick<DebugResponse, 'rooms'>): GraphLayout {
  const layers = new Map<number, DebugRoomDTO[]>();
  for (const r of data.rooms) {
    const list = layers.get(r.depth) ?? [];
    list.push(r);
    layers.set(r.depth, list);
  }
  const depths = [...layers.keys()].sort((a, b) => a - b);
  const columnHeight = (rooms: DebugRoomDTO[]): number =>
    rooms.reduce((h, r) => h + HEADER_H + ROW_H * r.doors.length + 8 + GAP_Y, -GAP_Y);
  const height = Math.max(0, ...depths.map((d) => columnHeight(layers.get(d) ?? [])));

  const nodes = new Map<RoomId, NodeBox>();
  depths.forEach((depth, column) => {
    const rooms = [...(layers.get(depth) ?? [])].sort(byId);
    // Centre each column vertically.
    let y = (height - columnHeight(rooms)) / 2;
    for (const room of rooms) {
      const h = HEADER_H + ROW_H * room.doors.length + 8;
      const doorY = new Map<string, number>();
      [...room.doors].sort(byId).forEach((d, i) => {
        doorY.set(d.id, y + HEADER_H + ROW_H * i + ROW_H / 2);
      });
      nodes.set(room.id, { room, x: column * (NODE_W + GAP_X), y, w: NODE_W, h, doorY });
      y += h + GAP_Y;
    }
  });

  const edges: LinkEdge[] = [];
  const sealed: GraphLayout['sealed'] = [];
  const drawn = new Set<string>();
  const rooms = [...data.rooms].sort(byId);
  const linkOf = (room: RoomId, door: string) =>
    rooms.find((r) => r.id === room)?.doors.find((d) => d.id === door)?.link ?? null;
  for (const room of rooms) {
    for (const door of [...room.doors].sort(byId)) {
      const link = door.link;
      if (link === null) {
        sealed.push({ room: room.id, door: door.id });
        continue;
      }
      const key = `${room.id}.${door.id}`;
      if (drawn.has(key)) continue;
      const from = { room: room.id, door: door.id };
      const to = { room: link.room, door: link.door };
      if (link.room === room.id) {
        edges.push({ kind: 'self', from, to, label: `${door.id}→${link.door}` });
        continue;
      }
      const back = linkOf(link.room, link.door);
      if (back?.room === room.id && back.door === door.id) {
        drawn.add(`${link.room}.${link.door}`);
        edges.push({
          kind: 'reciprocal',
          from,
          to,
          label: `${door.id}↔${link.door}`,
        });
      } else {
        edges.push({ kind: 'oneWay', from, to, label: `${door.id}→${link.door}` });
      }
    }
  }
  const twins = rooms.flatMap((r) => (r.twinOf ? [{ twin: r.id, original: r.twinOf }] : []));
  const columns = depths.length;
  return {
    nodes,
    edges,
    sealed,
    twins,
    width: Math.max(NODE_W, columns * NODE_W + (columns - 1) * GAP_X),
    height,
  };
}

/** The links a path walks: `room.exitDoor` keys. */
export function pathLinks(path: readonly PathStep[]): Set<string> {
  return new Set(path.flatMap((s) => (s.exitDoor === null ? [] : [`${s.room}.${s.exitDoor}`])));
}

/**
 * The path as text (CP10 A2), for example
 * `START (Living room r03) → Kitchen r07 [d1→d2] → … → GOAL (Bathroom r09)`.
 * `name` gives a room's localised type name; `words` the localised START and GOAL.
 */
export function pathText(
  path: readonly PathStep[],
  name: (room: RoomId) => string,
  words: { start: string; goal: string } = { start: 'START', goal: 'GOAL' },
): string {
  if (path.length === 0) return '';
  const label = (room: RoomId) => `${name(room)} ${room}`;
  const parts: string[] = [];
  path.forEach((step, i) => {
    const prev = path[i - 1];
    const last = i === path.length - 1;
    if (i === 0) {
      parts.push(
        last
          ? `${words.start} = ${words.goal} (${label(step.room)})`
          : `${words.start} (${label(step.room)})`,
      );
    } else if (last) {
      parts.push(`${words.goal} (${label(step.room)})`);
    } else {
      const via = prev?.exitDoor && step.arriveDoor ? ` [${prev.exitDoor}→${step.arriveDoor}]` : '';
      parts.push(`${label(step.room)}${via}`);
    }
  });
  return parts.join(' → ');
}
