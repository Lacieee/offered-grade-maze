/**
 * The hand-authored fixture house (CP02 T3): six rooms that reproduce the spec §2 scenario
 * (reciprocal, asymmetric and self-linked doors, a sealed one-way door and a cycle).
 * CP03 tests depend on these links; do not change them without updating CP03.
 *
 * Every room is validated against the shared Zod schema when this module loads.
 */
import { RoomDTOSchema, doorFrame, type RoomDTO, type RoomId, type Spawn } from '@ogm/shared';
import { yawToward } from '../../engine/player/physics.js';
import r00 from './r00.json';
import r01 from './r01.json';
import r02 from './r02.json';
import r03 from './r03.json';
import r04 from './r04.json';
import r05 from './r05.json';

/** Start room of the fixture house. */
export const FIXTURE_START: RoomId = 'r00';
/** Temporary goal room of the fixture house. */
export const FIXTURE_GOAL: RoomId = 'r05';

/** All fixture rooms, validated, in ID order. */
export const FIXTURE_ROOMS: readonly RoomDTO[] = [r00, r01, r02, r03, r04, r05].map((json) =>
  RoomDTOSchema.parse(json),
);

/** Looks up a fixture room. */
export function fixtureRoom(id: string): RoomDTO | undefined {
  return FIXTURE_ROOMS.find((r) => r.id === id);
}

/** Dev spawn: the centre of the room, facing door d0. */
export function fixtureSpawn(room: RoomDTO): Spawn {
  const d0 = room.doors.find((d) => d.id === 'd0') ?? room.doors[0];
  if (!d0) return { x: 0, z: 0, yaw: 0 };
  const { origin } = doorFrame(room, d0);
  return { x: 0, z: 0, yaw: yawToward(0, 0, origin.x, origin.z) };
}
