/**
 * The game engine: renderer, fixed-step loop, world, player. Framework-free (no React).
 *
 * Usage: `init(canvas)` → `loadRooms(rooms)` → `setCurrentRoom(id, spawn)` → `start()`.
 */
import { EYE_HEIGHT, type RoomDTO, type RoomId, type Spawn } from '@ogm/shared';
import type * as THREE from 'three';
import { PerfStats, type PerfSummary } from './debug/PerfStats.js';
import { FixedStepClock, SIM_STEP } from './loop/FixedStepClock.js';
import { InputState, bindInput } from './player/input.js';
import { stepBody, type Body } from './player/physics.js';
import { createCamera, createRenderer } from './render/createRenderer.js';
import { Emitter, type Unsubscribe } from './util/emitter.js';
import { clamp, deg, lerp } from './util/math.js';
import { World } from './world/World.js';

export { UnsupportedError } from './util/errors.js';
export type { Unsubscribe } from './util/emitter.js';
export type { PerfSummary } from './debug/PerfStats.js';

/** Default mouse sensitivity (radians per pixel). */
export const DEFAULT_SENSITIVITY = 0.0022;
/** Pitch limit (radians). */
export const MAX_PITCH = deg(85);

/** Events the engine emits. */
export interface EngineEvents extends Record<string, unknown> {
  /** The player is now in this room. */
  roomChanged: RoomId;
  /** A frame was rendered; `dt` is the frame delta in seconds. */
  frame: { dt: number };
  /** Pointer Lock was gained (true) or lost (false). */
  pointerLock: boolean;
}

/** Snapshot of the player for UI and tests. */
export interface EngineState {
  room: RoomId;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface Pose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Look settings (sensitivity in radians per pixel). */
export interface LookSettings {
  sensitivity: number;
  invertY: boolean;
}

export class Engine {
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly world = new World();
  private readonly input = new InputState();
  private readonly clock = new FixedStepClock();
  private readonly events = new Emitter<EngineEvents>();
  private readonly perf = new PerfStats();
  private unbindInput: (() => void) | null = null;
  private readonly onResize = (): void => {
    this.resize();
  };

  private room: RoomId | null = null;
  private body: Body = { x: 0, z: 0, vx: 0, vz: 0 };
  private yaw = 0;
  private pitch = 0;
  private prev: Pose = { x: 0, z: 0, yaw: 0, pitch: 0 };
  private look: LookSettings = { sensitivity: DEFAULT_SENSITIVITY, invertY: false };

  private rafId: number | null = null;
  private lastFrameAt: number | null = null;

  /**
   * Creates the renderer on `canvas` and wires input.
   *
   * @throws UnsupportedError if WebGL2 is missing.
   */
  init(canvas: HTMLCanvasElement): void {
    if (this.renderer) throw new Error('Engine already initialised');
    this.renderer = createRenderer(canvas);
    this.canvas = canvas;
    this.camera = createCamera(1);
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.unbindInput = bindInput(canvas, this.input, (locked) => {
      if (!locked) {
        // Stop immediately when the lock is lost (Esc, tab switch).
        this.body = { ...this.body, vx: 0, vz: 0 };
      }
      this.events.emit('pointerLock', locked);
    });
  }

  /** Builds and caches rooms by ID (already cached rooms are skipped). */
  loadRooms(rooms: readonly RoomDTO[]): void {
    const built = this.world.load(rooms);
    const { renderer, camera } = this;
    if (renderer && camera) {
      // Compile shader programs now, so first sight of a room never hitches.
      for (const view of built) renderer.compile(view.scene, camera);
    }
  }

  /**
   * Puts the player in a loaded room at `spawn`, at rest.
   *
   * @throws Error if the room is not loaded.
   */
  setCurrentRoom(id: RoomId, spawn: Spawn): void {
    if (!this.world.get(id)) throw new Error(`Room ${id} is not loaded`);
    this.room = id;
    this.body = { x: spawn.x, z: spawn.z, vx: 0, vz: 0 };
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.prev = this.pose();
    this.clock.reset();
    this.events.emit('roomChanged', id);
  }

  /** Starts the render loop. */
  start(): void {
    if (this.rafId !== null || !this.renderer) return;
    this.lastFrameAt = null;
    this.clock.reset();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Stops the render loop. */
  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** Stops the loop and frees every resource. The engine cannot be reused. */
  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.unbindInput?.();
    this.unbindInput = null;
    this.world.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.events.clear();
  }

  /** Subscribes to an engine event. */
  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): Unsubscribe {
    return this.events.on(event, cb);
  }

  /** Current player state. */
  getState(): EngineState {
    return {
      room: this.room ?? '',
      x: this.body.x,
      z: this.body.z,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  /** Rolling performance statistics (for the `?perf=1` overlay). */
  getPerf(): PerfSummary {
    return this.perf.summary();
  }

  /** IDs of the loaded rooms. */
  loadedRooms(): RoomId[] {
    return this.world.ids();
  }

  /** Changes mouse sensitivity and Y inversion. */
  setLookSettings(settings: Partial<LookSettings>): void {
    this.look = { ...this.look, ...settings };
  }

  private pose(): Pose {
    return { x: this.body.x, z: this.body.z, yaw: this.yaw, pitch: this.pitch };
  }

  private resize(): void {
    const { renderer, camera, canvas } = this;
    if (!renderer || !camera || !canvas) return;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  private simulate(dt: number): void {
    const view = this.room ? this.world.get(this.room) : undefined;
    if (!view) return;
    const { dx, dy } = this.input.consumeLook();
    const s = this.look.sensitivity;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s * (this.look.invertY ? -1 : 1), -MAX_PITCH, MAX_PITCH);
    this.body = stepBody(this.body, this.input.intent(), this.yaw, dt, view.colliders);
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    const dt = this.lastFrameAt === null ? 0 : (now - this.lastFrameAt) / 1000;
    this.lastFrameAt = now;

    const { steps, alpha } = this.clock.advance(dt);
    for (let i = 0; i < steps; i++) {
      this.prev = this.pose();
      this.simulate(SIM_STEP);
    }
    this.render(alpha);
    if (dt > 0) {
      const info = this.renderer?.info.render;
      this.perf.record(now, dt * 1000, {
        drawCalls: info?.calls ?? 0,
        triangles: info?.triangles ?? 0,
        passes: 1,
      });
    }
    this.events.emit('frame', { dt });
  };

  private render(alpha: number): void {
    const { renderer, camera } = this;
    const view = this.room ? this.world.get(this.room) : undefined;
    if (!renderer || !camera || !view) return;
    const cur = this.pose();
    camera.position.set(
      lerp(this.prev.x, cur.x, alpha),
      EYE_HEIGHT,
      lerp(this.prev.z, cur.z, alpha),
    );
    camera.rotation.set(
      lerp(this.prev.pitch, cur.pitch, alpha),
      lerp(this.prev.yaw, cur.yaw, alpha),
      0,
    );
    renderer.render(view.scene, camera);
  }
}
