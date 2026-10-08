/**
 * `pnpm gen fixtures [--write]`: furnishes the client's hand-made fixture house
 * (`packages/client/src/dev/fixtures/r00…r05.json`) with the CP05 furnisher, so the dev
 * scene and the Playwright tests use real catalogue furniture. Doors, links, sizes, palettes
 * and the ceiling light stay as authored. Every room gets a spawn zone (the dev scene spawns
 * in each room's centre); r05 is the goal room.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { RoomDTOSchema, type RoomDTO } from '@ogm/shared';
import { furnishHouse, type HouseRoom } from '../furnish/house.js';
import { checkFurniture } from '../validate/furniture.js';

const DIR = new URL('../../../client/src/dev/fixtures/', import.meta.url);
const IDS = ['r00', 'r01', 'r02', 'r03', 'r04', 'r05'];
/** PRNG seed label of the fixture furnishing. */
export const FIXTURE_SEED = 'FIXTURE';
const START = 'r00';
const GOAL = 'r05';

/** Re-furnishes the fixture rooms; returns validator messages (empty when valid). */
export function furnishFixtures(write: boolean): { rooms: RoomDTO[]; issues: string[] } {
  const rooms = IDS.map((id) =>
    RoomDTOSchema.parse(JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8'))),
  );
  const house: HouseRoom[] = rooms.map((r) => ({
    tempId: r.id,
    twinOf: null,
    type: r.type,
    widthU: r.width * 4,
    depthU: r.depth * 4,
    doors: r.doors.map((d) => ({ wall: d.wall, offset: d.offset * 4 })),
    isStart: true,
    isGoal: r.id === GOAL,
  }));
  const furnished = furnishHouse(FIXTURE_SEED, house);
  const out = rooms.map((r): RoomDTO => {
    const f = furnished.get(r.id);
    if (f === undefined) throw new Error(`fixture ${r.id} was not furnished`);
    const ceiling = r.lights[0] ?? f.lights[0];
    const room: RoomDTO = {
      ...r,
      furniture: f.furniture,
      lights: ceiling === undefined ? f.lights : [ceiling, ...f.lights.slice(1)],
    };
    if (r.id === GOAL) room.goal = { x: 0, y: 1.2, z: 0 };
    return room;
  });
  const issues: string[] = [];
  checkFurniture(out, START, GOAL, (check, message) => issues.push(`${check} ${message}`));
  if (write && issues.length === 0) {
    for (const r of out) {
      writeFileSync(new URL(`${r.id}.json`, DIR), `${JSON.stringify(r, null, 2)}\n`);
    }
  }
  return { rooms: out, issues };
}
