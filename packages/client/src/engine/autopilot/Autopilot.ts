/**
 * Autopilot (CP10 A3): plays the game along the debug view's guaranteed path through the
 * normal input system, so the real controller, collision, door crossing, streaming and the
 * server's validation all run as for a player.
 *
 * In each room it plans a walk to the exit door with A* ({@link findPath}), walks it with
 * synthetic keys and turns of at most 180°/s, and walks on through the doorway. After each
 * crossing it re-reads the path. It reports `stuck` after 5 s (game time) without progress.
 */
import { shortestPath, type DebugResponse, type PathStep, type RoomId } from '@ogm/shared';
import type {
  DriverInput,
  DriverState,
  EngineEvents,
  InputDriver,
  RoomGeometry,
} from '../Engine.js';
import { normalizeAngle } from '../portals/portalMath.js';
import { yawToward } from '../player/physics.js';
import type { Unsubscribe } from '../util/emitter.js';
import { CELL, buildGrid, findPath, type Grid, type Point } from './planner.js';

/** Turn rate limit (rad/s): 180°/s. */
export const MAX_TURN_RATE = Math.PI;
/** No progress for this long (game seconds) means stuck. */
export const STUCK_SECONDS = 5;
/** Waiting at a doorway for its target room to stream in gives up after this long. */
export const STREAM_WAIT_SECONDS = 30;
/** Stand this far in front of the exit door before walking through (m). */
const APPROACH = 0.7;
/** Walk to this far beyond the door plane (m); the crossing happens on the way. */
const THROUGH = 0.8;
/** A waypoint counts as reached within this distance (m). */
const REACHED = 0.2;
/** Walk forward only while facing within this angle of the waypoint (rad). */
const WALK_CONE = 0.5;
/** Progress: getting this much closer (m) to the current target resets the stuck timer. */
const PROGRESS = 0.1;

/** What the autopilot needs from the engine. */
export interface AutopilotHost {
  setDriver(driver: InputDriver | null): void;
  roomGeometry(id: RoomId): RoomGeometry | undefined;
  on<K extends 'roomChanged' | 'goalReached'>(
    event: K,
    cb: (payload: EngineEvents[K]) => void,
  ): Unsubscribe;
}

export type AutopilotResult = 'completed' | 'stuck';

/** Steering toward a point: the turn for this step and whether to walk. */
export function steer(
  pose: { x: number; z: number; yaw: number },
  target: Point,
  dt: number,
): { turn: number; forward: boolean } {
  const want = yawToward(pose.x, pose.z, target.x, target.z);
  const err = normalizeAngle(want - pose.yaw);
  const max = MAX_TURN_RATE * dt;
  const turn = Math.min(max, Math.max(-max, err));
  return { turn, forward: Math.abs(err) < WALK_CONE };
}

interface RoomPlan {
  room: RoomId;
  /** Waypoints still ahead; the last one is the doorway's far side or the goal. */
  waypoints: Point[];
  /** The exit door, or null in the goal room. */
  door: string | null;
}

export class Autopilot {
  private running: {
    resolve: (r: AutopilotResult) => void;
    offs: Unsubscribe[];
  } | null = null;
  private steps: PathStep[] = [];
  private graph: DebugResponse | null = null;
  private plan: RoomPlan | null = null;
  private best = Infinity;
  private idle = 0;
  private waiting = 0;
  /** Why the last walk ended (for diagnostics): `completed`, or what went wrong where. */
  lastStop = '';

  constructor(
    private readonly host: AutopilotHost,
    /** The debug view's data (`GET /games/:id/debug`). */
    private readonly readPath: () => Promise<DebugResponse>,
  ) {}

  /** Whether a walk is in progress. */
  get isRunning(): boolean {
    return this.running !== null;
  }

  /**
   * Walks to the goal along the guaranteed path from the current room (or, with `'start'`,
   * along the path from the start room while the player is on it). Resolves `completed` at
   * the pickup, `stuck` if it cannot make progress.
   */
  async followPath(from: 'current' | 'start' = 'current'): Promise<AutopilotResult> {
    this.stop();
    let data: DebugResponse;
    try {
      data = await this.readPath();
    } catch (err) {
      this.lastStop = `could not read the path: ${String(err)}`;
      return 'stuck';
    }
    this.graph = data;
    this.steps = from === 'start' ? data.pathFromStart : data.pathFromCurrent;
    this.plan = null;
    this.best = Infinity;
    this.idle = 0;
    this.waiting = 0;
    return new Promise<AutopilotResult>((resolve) => {
      const offs = [
        this.host.on('goalReached', () => {
          this.finish('completed');
        }),
        this.host.on('roomChanged', () => {
          this.plan = null;
          this.best = Infinity;
          this.idle = 0;
          // Re-read the path after each crossing; until it arrives the local graph serves.
          void this.readPath()
            .then((d) => {
              if (!this.running) return;
              this.graph = d;
              this.steps = d.pathFromCurrent;
            })
            .catch(() => undefined);
        }),
      ];
      this.running = { resolve, offs };
      this.host.setDriver((s, input) => {
        this.drive(s, input);
      });
    });
  }

  /** Stops walking (the pending `followPath` resolves `stuck`). */
  stop(): void {
    this.finish('stuck', 'stopped');
  }

  private finish(result: AutopilotResult, reason: string = result): void {
    const r = this.running;
    if (!r) return;
    this.lastStop = reason;
    this.running = null;
    this.host.setDriver(null);
    for (const off of r.offs) off();
    r.resolve(result);
  }

  /** The exit door of `room` on the path (null in the goal room, undefined if unknown). */
  private exitDoor(room: RoomId): string | null | undefined {
    const onPath = this.steps.find((s) => s.room === room);
    if (onPath) return onPath.exitDoor;
    const g = this.graph;
    if (!g) return undefined;
    // Off the known path (the re-read is still on its way): the same BFS the server uses.
    const local = shortestPath(g.rooms, room, g.goal);
    return local?.[0]?.exitDoor ?? (room === g.goal ? null : undefined);
  }

  /** Why the last plan failed (diagnostics). */
  private planIssue = '';

  private planRoom(s: DriverState): RoomPlan | null {
    const geo = this.host.roomGeometry(s.room);
    const door = this.exitDoor(s.room);
    this.planIssue = !geo ? 'room not built' : door === undefined ? 'not on the path' : '';
    if (!geo || door === undefined) return null;
    /**
     * The route with the furniture margin of one cell; where furniture leaves no such route
     * (a narrow gap, or the player standing in the margin), with less margin.
     */
    const route = (to: Point): Point[] | null => {
      for (const margin of [CELL, 0.1, 0.02]) {
        const grid: Grid = buildGrid(geo, undefined, margin);
        const path = findPath(grid, s, to);
        if (path) return path;
      }
      return null;
    };
    if (door === null) {
      if (!geo.goal) return null;
      const path = route(geo.goal);
      // The goal zone may be inside the inflated margin: finish on the goal itself.
      return { room: s.room, door, waypoints: [...(path ?? []), geo.goal] };
    }
    const d = geo.doors.find((x) => x.id === door);
    if (!d) {
      this.planIssue = `no door ${door}`;
      return null;
    }
    const { origin, inward } = d.frame;
    const approach = { x: origin.x + inward.x * APPROACH, z: origin.z + inward.z * APPROACH };
    const through = { x: origin.x - inward.x * THROUGH, z: origin.z - inward.z * THROUGH };
    const path = route(approach);
    if (!path) {
      this.planIssue = `no route from (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) to ${door}`;
      return null;
    }
    return { room: s.room, door, waypoints: [...path, approach, through] };
  }

  private drive(s: DriverState, input: DriverInput): void {
    if (this.plan?.room !== s.room) this.plan = this.planRoom(s);
    const plan = this.plan;
    if (!plan) {
      input.drive(null);
      this.tick(s.dt, Infinity, `${s.room}: no plan (${this.planIssue})`);
      return;
    }
    // Drop reached waypoints (never the last: the doorway or the goal is walked into).
    let target = plan.waypoints[0];
    while (
      target &&
      plan.waypoints.length > 1 &&
      Math.hypot(target.x - s.x, target.z - s.z) < REACHED
    ) {
      plan.waypoints.shift();
      this.best = Infinity;
      target = plan.waypoints[0];
    }
    if (!target) {
      input.drive(null);
      return;
    }
    // In front of a doorway whose room has not streamed in yet: wait (not "stuck").
    if (plan.door !== null && plan.waypoints.length === 1) {
      const door = this.host.roomGeometry(s.room)?.doors.find((d) => d.id === plan.door);
      if (door && !door.open) {
        input.drive(null);
        this.waiting += s.dt;
        if (this.waiting > STREAM_WAIT_SECONDS) {
          this.finish('stuck', `${s.room}.${plan.door}: target room never streamed in`);
        }
        return;
      }
    }
    this.waiting = 0;
    const { turn, forward } = steer(s, target, s.dt);
    input.turn(turn);
    input.drive({ forward });
    this.tick(
      s.dt,
      Math.hypot(target.x - s.x, target.z - s.z),
      `${s.room} (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) → ${plan.door ?? 'goal'} via (${target.x.toFixed(2)}, ${target.z.toFixed(2)}): no progress`,
    );
  }

  /** Stuck detection: `distance` to the current target must keep shrinking. */
  private tick(dt: number, distance: number, why: string): void {
    if (distance < this.best - PROGRESS) {
      this.best = distance;
      this.idle = 0;
      return;
    }
    this.idle += dt;
    if (this.idle > STUCK_SECONDS) this.finish('stuck', why);
  }
}
