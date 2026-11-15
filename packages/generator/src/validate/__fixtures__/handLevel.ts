/**
 * Hand-built levels for validator tests. Every room is 4 × 4 m with one door per wall
 * (d0 N, d1 E, d2 S, d3 W, offset 0), so placement is always valid unless a test changes it.
 * Each room has one signature painting and a ceiling light (plus the goal light in the goal
 * room), so the furniture checks pass too.
 */
import { WALLS, distancesFrom, type Difficulty, type RoomDTO } from '@ogm/shared';
import { levelHash } from '../../hash/canonical.js';
import { computeMetrics } from '../../metrics/metrics.js';
import type { Level } from '../../types.js';

/** `{ r00: ['r01.d0', null], … }`: one entry per door; `null` = sealed. */
export type HandSpec = Record<string, (string | null)[]>;

/** Builds a level; depths are BFS distances from the start (0 when unreachable). */
export function handLevel(
  spec: HandSpec,
  start = 'r00',
  goal = 'r01',
  difficulty: Difficulty = 'easy',
): Level {
  const rooms: RoomDTO[] = Object.keys(spec)
    .sort()
    .map((id) => ({
      id,
      type: 'study',
      label: 'room.study',
      width: 4,
      depth: 4,
      height: 2.8,
      floor: 'carpet',
      palette: { wall: '#c8c8c8', floor: '#8c8c8c', trim: '#e6e6e6', ceiling: '#f0f0f0' },
      doors: (spec[id] ?? []).map((to, i) => {
        const [room = '', door = ''] = to === null ? [] : to.split('.');
        return {
          id: `d${i}`,
          wall: WALLS[i % 4] ?? 'N',
          offset: 0,
          link: to === null ? null : { room, door },
        };
      }),
      // One unique signature per room (V7): a painting hung on the north wall.
      furniture: [
        {
          id: 'f00',
          prefab: 'sig_painting',
          x: -0.625,
          z: -1.875,
          rot: 0,
          variant: 0,
          colors: ['#c0262d', '#f2f2f2'],
          signature: true,
          params: { pattern: 'stripes', seed: Number(id.slice(1)) },
        },
      ],
      lights:
        id === goal
          ? [
              { kind: 'ceiling', x: 0, y: 2.6, z: 0, color: '#fff2dd', intensity: 1 },
              { kind: 'goal', x: 0, y: 1.2, z: 0, color: '#ffcf6b', intensity: 1.2 },
            ]
          : [{ kind: 'ceiling', x: 0, y: 2.6, z: 0, color: '#fff2dd', intensity: 1 }],
      ...(id === goal ? { goal: { x: 0, y: 1.2, z: 0 } } : {}),
    }));
  return finish({
    seed: 'E1-0000-0000',
    difficulty,
    generatorVersion: 1,
    startRoom: start,
    goalRoom: goal,
    spawn: { x: 0, z: 0, yaw: 0 },
    rooms,
    meta: {
      depth: {},
      spine: [start, goal],
      twinOf: {},
      attempts: 1,
      metrics: computeMetrics({
        rooms,
        startRoom: start,
        goalRoom: goal,
        depth: {},
        spine: [],
        twinOf: {},
      }),
      levelHash: '',
    },
  });
}

/** Recomputes depths, metrics and the hash after a test edits a level. */
export function finish(level: Level): Level {
  const dist = distancesFrom(level.rooms, level.startRoom);
  const depth = Object.fromEntries(level.rooms.map((r) => [r.id, dist.get(r.id) ?? 0]));
  const twinOf = Object.fromEntries(
    level.rooms.map((r) => [r.id, level.meta.twinOf[r.id] ?? null]),
  );
  const meta = { ...level.meta, depth, twinOf };
  meta.metrics = computeMetrics({ ...level, ...meta });
  const out = { ...level, meta };
  out.meta.levelHash = levelHash(out);
  return out;
}
