/**
 * The independent level validator (CP04 T4, architecture §9).
 *
 * Takes only a finished `Level` and must never import from `src/topology/`, so a generator
 * bug cannot hide itself. Sealed doors add no graph edge. Cycles are allowed.
 */
import {
  DOOR_HEIGHT,
  DOOR_SPACING,
  DOOR_WIDTH,
  GRID,
  RoomDTOSchema,
  WALLS,
  distancesFrom,
  distancesTo,
  maxDoorOffset,
  type RoomDTO,
} from '@ogm/shared';
import { DIFFICULTY_TABLE, type Range } from '../difficulty/table.js';
import { levelHash } from '../hash/canonical.js';
import { computeMetrics } from '../metrics/metrics.js';
import type { CheckId, Level, LevelMetrics, ValidationIssue } from '../types.js';

/** Tolerance for metre comparisons (all generated values are multiples of 0.25). */
const EPS = 1e-9;

function inRange(v: number, r: Range): boolean {
  return v >= r.min && v <= r.max;
}

/**
 * Validates a level. Returns every issue found; an empty array means the level is valid.
 * Graph checks (V1–V4) are skipped when the structure (V5) is broken.
 */
export function validateLevel(level: Level): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (check: CheckId, message: string, room?: string): void => {
    issues.push(room === undefined ? { check, message } : { check, message, room });
  };

  const structuralOk = checkStructure(level, add);
  checkDoorPlacement(level.rooms, add);
  if (!structuralOk) return issues;

  // ---------------------------------------------------------------- graph (V1–V4)
  const R = distancesFrom(level.rooms, level.startRoom);
  const C = distancesTo(level.rooms, level.goalRoom);
  if (!R.has(level.goalRoom)) add('V1', 'goal is not reachable from the start');
  for (const id of [...R.keys()].sort()) {
    if (!C.has(id)) add('V2', `reachable room ${id} cannot reach the goal (trap region)`, id);
  }
  const params = DIFFICULTY_TABLE[level.difficulty];
  const shortest = R.get(level.goalRoom);
  if (shortest !== undefined && !inRange(shortest, params.solutionLength)) {
    add(
      'V3',
      `shortest start → goal distance ${shortest} is outside ${params.solutionLength.min}–${params.solutionLength.max}`,
    );
  }
  for (const room of level.rooms) {
    if (!R.has(room.id)) add('V4', `room ${room.id} is not reachable from the start`, room.id);
  }

  // ---------------------------------------------------------------- metrics (V9)
  const m = computeMetrics({
    rooms: level.rooms,
    startRoom: level.startRoom,
    goalRoom: level.goalRoom,
    depth: level.meta.depth,
    spine: level.meta.spine,
    twinOf: level.meta.twinOf,
  });
  const ranges: [keyof LevelMetrics, Range][] = [
    ['rooms', params.rooms],
    ['asymmetricShare', params.asymmetricShare],
    ['selfLinks', params.selfLinks],
    ['sealedDoors', params.sealedDoors],
    ['longBackLinks', params.longBackLinks],
    ['twins', params.twins],
    ['misleadingDoors', { min: params.misleadingDoorsMin, max: Number.MAX_SAFE_INTEGER }],
  ];
  for (const [key, range] of ranges) {
    if (!inRange(m[key], range)) {
      add('V9', `metric ${key} = ${m[key]} is outside ${range.min}–${range.max}`);
    }
  }
  for (const key of Object.keys(m).sort() as (keyof LevelMetrics)[]) {
    if (level.meta.metrics[key] !== m[key]) {
      add(
        'V9',
        `recorded metric ${key} = ${level.meta.metrics[key]} but the level gives ${m[key]}`,
      );
    }
  }

  // ---------------------------------------------------------------- hash (V10)
  if (level.meta.levelHash !== levelHash(level)) {
    add('V10', 'meta.levelHash does not match the canonical JSON of the level');
  }
  return issues;
}

/** V5: structural integrity. Returns false when the graph checks cannot run. */
function checkStructure(
  level: Level,
  add: (check: CheckId, message: string, room?: string) => void,
): boolean {
  let ok = true;
  const fail = (message: string, room?: string): void => {
    ok = false;
    add('V5', message, room);
  };
  const byId = new Map<string, RoomDTO>();
  for (const room of level.rooms) {
    if (byId.has(room.id)) fail(`duplicate room id ${room.id}`, room.id);
    byId.set(room.id, room);
    const parsed = RoomDTOSchema.safeParse(room);
    if (!parsed.success) fail(`room ${room.id} is not a valid RoomDTO`, room.id);
  }
  if (!byId.has(level.startRoom)) fail(`start room ${level.startRoom} does not exist`);
  if (!byId.has(level.goalRoom)) fail(`goal room ${level.goalRoom} does not exist`);
  if (level.startRoom === level.goalRoom) fail('start room and goal room are the same');

  for (const room of level.rooms) {
    if (room.doors.length < 1 || room.doors.length > 4) {
      fail(`room ${room.id} has ${room.doors.length} doors (1–4 allowed)`, room.id);
    }
    const doorIds = new Set<string>();
    for (const door of room.doors) {
      if (doorIds.has(door.id)) fail(`room ${room.id} has duplicate door id ${door.id}`, room.id);
      doorIds.add(door.id);
      const link = door.link;
      if (link === null) continue;
      if (link.room === room.id && link.door === door.id) {
        fail(`door ${room.id}.${door.id} links to itself`, room.id);
        continue;
      }
      const target = byId.get(link.room)?.doors.find((d) => d.id === link.door);
      if (target === undefined) {
        fail(`door ${room.id}.${door.id} links to missing ${link.room}.${link.door}`, room.id);
      } else if (target.link === null) {
        // PD9: sealed doors are decorative; nothing may arrive at one.
        fail(
          `door ${room.id}.${door.id} links into sealed door ${link.room}.${link.door}`,
          room.id,
        );
      }
    }
    const isGoal = room.id === level.goalRoom;
    if (isGoal && room.goal === undefined)
      fail(`goal room ${room.id} has no goal position`, room.id);
    if (!isGoal && room.goal !== undefined)
      fail(`room ${room.id} has a goal but is not the goal room`, room.id);
  }
  return ok;
}

/** V6: door placement (corner margin, spacing, no overlaps, door size fits). */
function checkDoorPlacement(
  rooms: readonly RoomDTO[],
  add: (check: CheckId, message: string, room?: string) => void,
): void {
  for (const room of rooms) {
    if (room.height < DOOR_HEIGHT) {
      add('V6', `room ${room.id} is lower than a ${DOOR_HEIGHT} m door`, room.id);
    }
    for (const wall of WALLS) {
      const doors = room.doors.filter((d) => d.wall === wall).sort((a, b) => a.offset - b.offset);
      const limit = maxDoorOffset(room, wall);
      for (const door of doors) {
        if (Math.abs(door.offset) > limit + EPS) {
          add('V6', `door ${room.id}.${door.id} is too close to a corner`, room.id);
        }
        if (Math.abs(door.offset / GRID - Math.round(door.offset / GRID)) > EPS) {
          add('V6', `door ${room.id}.${door.id} offset is not on the ${GRID} m grid`, room.id);
        }
      }
      for (let i = 0; i + 1 < doors.length; i++) {
        // Both indices are within the array by the loop condition.
        const a = doors[i] as (typeof doors)[number];
        const b = doors[i + 1] as (typeof doors)[number];
        const gap = b.offset - a.offset;
        if (gap < DOOR_WIDTH - EPS) {
          add('V6', `doors ${room.id}.${a.id} and ${b.id} overlap`, room.id);
        } else if (gap < DOOR_WIDTH + DOOR_SPACING - EPS) {
          add(
            'V6',
            `doors ${room.id}.${a.id} and ${b.id} are closer than ${DOOR_SPACING} m`,
            room.id,
          );
        }
      }
    }
  }
}
