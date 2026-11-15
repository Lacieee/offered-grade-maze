import { PLAYER_RADIUS, type DebugResponse, type DoorFrame } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import type { EngineEvents, InputDriver, RoomGeometry } from '../Engine.js';
import { InputState } from '../player/input.js';
import {
  circleContact,
  stepBody,
  type Body,
  type BoxCollider,
  type Collider,
  type SegmentCollider,
} from '../player/physics.js';
import { Emitter } from '../util/emitter.js';
import { Autopilot, MAX_TURN_RATE, steer, type AutopilotHost } from './Autopilot.js';
import { CELL, buildGrid, findPath, lineFree, nearestFree } from './planner.js';

const seg = (ax: number, az: number, bx: number, bz: number): SegmentCollider => ({
  kind: 'segment',
  ax,
  az,
  bx,
  bz,
});
const box = (minX: number, minZ: number, maxX: number, maxZ: number): BoxCollider => ({
  kind: 'box',
  minX,
  minZ,
  maxX,
  maxZ,
});

/** A 6 × 6 m room: four walls, a gap of 1 m in the north wall (z = −3) at x = 0. */
const WALLS: Collider[] = [
  seg(-3, -3, -0.5, -3),
  seg(0.5, -3, 3, -3),
  seg(3, -3, 3, 3),
  seg(3, 3, -3, 3),
  seg(-3, 3, -3, -3),
];
const DOOR: DoorFrame = {
  origin: { x: 0, y: 0, z: -3 },
  yaw: 0,
  inward: { x: 0, z: 1 },
  right: { x: 1, z: 0 },
};

describe('autopilot planner (CP10 A3)', () => {
  it('grid: walls block at the player radius, furniture one cell further', () => {
    const g = buildGrid({ width: 6, depth: 6, colliders: [...WALLS, box(-0.5, -0.5, 0.5, 0.5)] });
    const free = (x: number, z: number) => {
      const c = Math.round((x - g.x0) / CELL);
      const r = Math.round((z - g.z0) / CELL);
      return g.free[r * g.cols + c] === 1;
    };
    expect(free(-2, 2)).toBe(true);
    expect(free(-2.875, 0)).toBe(false); // 0.125 m from the west wall
    expect(free(0, 0)).toBe(false); // inside the box
    expect(free(0.875, 0)).toBe(false); // 0.375 m from the box: inside radius + one cell
    expect(free(1.125, 0)).toBe(true);
    expect(free(0.125, -2.875)).toBe(true); // in the doorway
  });

  it('A*: walks around furniture, never through it, and ends on the target', () => {
    const colliders = [...WALLS, box(-2, -0.25, 2, 0.25)];
    const g = buildGrid({ width: 6, depth: 6, colliders });
    const path = findPath(g, { x: 0, z: 2 }, { x: 0, z: -2 });
    expect(path).not.toBeNull();
    const points = [{ x: 0, z: 2 }, ...(path ?? [])];
    expect(points.at(-1)).toEqual({ x: 0, z: -2 });
    // Every leg stays on free cells, so it clears the box by the inflated margin.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a && b && i > 1) expect(lineFree(g, a, b)).toBe(true);
    }
    // It had to go round an end of the 4 m bench.
    expect(points.some((p) => Math.abs(p.x) > 2)).toBe(true);
  });

  it('no route through a sealed room; the nearest free cell of a blocked target', () => {
    const g = buildGrid({ width: 6, depth: 6, colliders: [...WALLS, seg(-3, 0, 3, 0)] });
    expect(findPath(g, { x: 0, z: 2 }, { x: 0, z: -2 })).toBeNull();
    const cell = nearestFree(g, { x: 0, z: 0 });
    expect(cell).not.toBeNull();
  });

  it('steering turns at most 180°/s and walks only when roughly facing the target', () => {
    const dt = 1 / 60;
    const behind = steer({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 5 }, dt); // target straight behind
    expect(Math.abs(behind.turn)).toBeCloseTo(MAX_TURN_RATE * dt, 9);
    expect(behind.forward).toBe(false);
    const ahead = steer({ x: 0, z: 0, yaw: 0 }, { x: 0.1, z: -5 }, dt);
    expect(ahead.forward).toBe(true);
    expect(Math.abs(ahead.turn)).toBeLessThan(MAX_TURN_RATE * dt);
  });
});

/** A one-room world with real physics; the room changes when the player passes z = −3. */
function world(colliders: Collider[], goal: { x: number; z: number } | null, open = true) {
  const events = new Emitter<EngineEvents>();
  const input = new InputState();
  let driver: InputDriver | null = null;
  let room = 'r00';
  let body: Body = { x: -2, z: 2, vx: 0, vz: 0 };
  let yaw = Math.PI / 2;
  let goalFired = false;
  const geo = (): RoomGeometry => ({
    id: room,
    width: 6,
    depth: 6,
    colliders,
    doors: [{ id: 'd0', frame: DOOR, link: { room: 'r01', door: 'd1' }, open }],
    goal,
  });
  const host: AutopilotHost = {
    setDriver: (d) => {
      driver = d;
      if (!d) input.drive(null);
    },
    roomGeometry: (id) => (id === room ? geo() : undefined),
    on: (event, cb) => events.on(event, cb),
  };
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      driver?.({ room, x: body.x, z: body.z, yaw, dt: 1 / 60 }, input);
      yaw += input.consumeTurn();
      const before = body.z;
      body = stepBody(body, input.intent(), yaw, 1 / 60, colliders);
      if (room === 'r00' && before > -3 && body.z <= -3) {
        room = 'r01';
        events.emit('roomChanged', { from: 'r00', door: 'd0', to: 'r01' });
      }
      if (goal && !goalFired && Math.hypot(body.x - goal.x, body.z - goal.z) < 0.9) {
        goalFired = true;
        events.emit('goalReached', { room });
      }
    }
  };
  return { host, step, pos: () => body, room: () => room };
}

const debugData = (steps: DebugResponse['pathFromCurrent']): DebugResponse => ({
  seed: 'M1-0000-0000',
  difficulty: 'medium',
  generatorVersion: 1,
  levelHash: 'test',
  start: 'r00',
  goal: steps.at(-1)?.room ?? 'r00',
  current: 'r00',
  rooms: [],
  metrics: {},
  pathFromStart: steps,
  pathFromCurrent: steps,
});

describe('Autopilot (CP10 A3)', () => {
  it('walks around furniture to the goal through the input system and completes', async () => {
    const w = world([...WALLS, box(-1, -0.5, 1, 0.5)], { x: 1.5, z: -2 });
    const pilot = new Autopilot(w.host, () =>
      Promise.resolve(debugData([{ room: 'r00', arriveDoor: null, exitDoor: null }])),
    );
    const done = pilot.followPath();
    await Promise.resolve();
    await Promise.resolve();
    for (let k = 0; k < 60 && pilot.isRunning; k++) w.step(10);
    await expect(done).resolves.toBe('completed');
    // It never stood inside the furniture.
    expect(circleContact(w.pos().x, w.pos().z, PLAYER_RADIUS, box(-1, -0.5, 1, 0.5))).toBeNull();
  });

  it('walks to the exit door and through it', async () => {
    const w = world([...WALLS], null);
    const pilot = new Autopilot(w.host, () =>
      Promise.resolve(
        debugData([
          { room: 'r00', arriveDoor: null, exitDoor: 'd0' },
          { room: 'r01', arriveDoor: 'd1', exitDoor: null },
        ]),
      ),
    );
    void pilot.followPath();
    await Promise.resolve();
    await Promise.resolve();
    for (let k = 0; k < 60 && w.room() === 'r00'; k++) w.step(10);
    expect(w.room()).toBe('r01');
    pilot.stop();
  });

  it('waits at a doorway whose room is still streaming, then reports stuck when boxed in', async () => {
    const waiting = world([...WALLS], null, false);
    const pilot = new Autopilot(waiting.host, () =>
      Promise.resolve(debugData([{ room: 'r00', arriveDoor: null, exitDoor: 'd0' }])),
    );
    const done = pilot.followPath();
    await Promise.resolve();
    await Promise.resolve();
    waiting.step(60 * 10); // 10 s: still waiting, not stuck
    expect(pilot.isRunning).toBe(true);
    expect(waiting.room()).toBe('r00');
    pilot.stop();
    await expect(done).resolves.toBe('stuck');

    // Boxed in: no route and no progress → stuck after 5 s of game time.
    const boxed = world([...WALLS, seg(-3, 1, 3, 1)], { x: 0, z: -2 });
    const p2 = new Autopilot(boxed.host, () =>
      Promise.resolve(debugData([{ room: 'r00', arriveDoor: null, exitDoor: null }])),
    );
    const r2 = p2.followPath();
    await Promise.resolve();
    await Promise.resolve();
    boxed.step(60 * 9);
    await expect(r2).resolves.toBe('stuck');
  });
});
