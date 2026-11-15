/**
 * Dev launcher for generated houses (CP06 implementation note):
 * `/?dev=level&file=sample-hard&room=r03`.
 *
 * Reads a level dumped with `pnpm gen dump <seed> --json packages/client/src/dev/levels/<file>.json`
 * (the client never imports the generator). `[` and `]` jump to the previous and next room;
 * Home jumps back to the start room. Only reachable in dev builds.
 */
import { RoomDTOSchema, SpawnSchema, doorFrame, type RoomDTO, type Spawn } from '@ogm/shared';
import type { Engine } from '../engine/Engine.js';
import { yawToward } from '../engine/player/physics.js';

/** The parts of a dumped `Level` the client uses. */
export interface DumpedLevel {
  seed: string;
  startRoom: string;
  goalRoom: string;
  spawn: Spawn;
  rooms: RoomDTO[];
}

/** Validates a dumped level with the shared schemas. */
export function parseDumpedLevel(json: unknown): DumpedLevel {
  const o = json as Partial<Record<keyof DumpedLevel, unknown>>;
  const text = (v: unknown, name: string): string => {
    if (typeof v !== 'string') throw new Error(`Dumped level: ${name} is not a string`);
    return v;
  };
  if (!Array.isArray(o.rooms)) throw new Error('Dumped level: rooms is not an array');
  return {
    seed: text(o.seed, 'seed'),
    startRoom: text(o.startRoom, 'startRoom'),
    goalRoom: text(o.goalRoom, 'goalRoom'),
    spawn: SpawnSchema.parse(o.spawn),
    rooms: o.rooms.map((r) => RoomDTOSchema.parse(r)),
  };
}

const FILES = import.meta.glob<unknown>('./levels/*.json', { import: 'default' });

/** Names of the available dumped levels (without `.json`). */
export function levelFiles(): string[] {
  return Object.keys(FILES)
    .map((k) => k.replace('./levels/', '').replace(/\.json$/, ''))
    .sort();
}

/** Loads and validates a dumped level by file name (with or without `.json`). */
export async function loadLevelFile(file: string): Promise<DumpedLevel> {
  const name = file.replace(/\.json$/, '');
  const load = FILES[`./levels/${name}.json`];
  if (load === undefined) {
    throw new Error(`No level '${name}' in src/dev/levels (have: ${levelFiles().join(', ')})`);
  }
  return parseDumpedLevel(await load());
}

/** Room centre facing door d0 (the same convention as the fixture house). */
export function roomSpawn(room: RoomDTO): Spawn {
  const d0 = room.doors[0];
  if (d0 === undefined) return { x: 0, z: 0, yaw: 0 };
  const { origin } = doorFrame(room, d0);
  return { x: 0, z: 0, yaw: yawToward(0, 0, origin.x, origin.z) };
}

/** Loads the level into the engine and starts it in `roomId` (default: the start room). */
export function startLevelScene(
  engine: Engine,
  level: DumpedLevel,
  roomId: string | null,
): () => void {
  engine.loadRooms(level.rooms);
  const ids = level.rooms.map((r) => r.id).sort();
  let current = level.startRoom;
  const jump = (id: string): void => {
    const room = level.rooms.find((r) => r.id === id);
    if (room === undefined) return;
    current = id;
    engine.setCurrentRoom(id, id === level.startRoom ? level.spawn : roomSpawn(room));
  };
  jump(roomId !== null && ids.includes(roomId) ? roomId : level.startRoom);
  const offRoom = engine.on('roomChanged', (change) => {
    current = change.to;
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const i = ids.indexOf(current);
    if (e.code === 'BracketRight') jump(ids[(i + 1) % ids.length] ?? current);
    if (e.code === 'BracketLeft') jump(ids[(i - 1 + ids.length) % ids.length] ?? current);
    if (e.code === 'Home') jump(level.startRoom);
  };
  window.addEventListener('keydown', onKey);
  engine.start();
  return () => {
    offRoom();
    window.removeEventListener('keydown', onKey);
  };
}
