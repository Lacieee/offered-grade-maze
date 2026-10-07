/**
 * The game engine: renderer, fixed-step loop, world, player, portals. Framework-free (no React).
 *
 * Usage: `init(canvas)` → `loadRooms(rooms)` → `setCurrentRoom(id, spawn)` → `start()`.
 */
import { EYE_HEIGHT, type DoorId, type RoomDTO, type RoomId, type Spawn } from '@ogm/shared';
import * as THREE from 'three';
import { PerfStats, type PerfSummary } from './debug/PerfStats.js';
import { PortalDebugOverlay } from './debug/PortalDebugOverlay.js';
import { FixedStepClock, SIM_STEP } from './loop/FixedStepClock.js';
import { InputState, bindInput } from './player/input.js';
import { stepBody, type Body, type Collider, type MoveIntent } from './player/physics.js';
import { PortalRenderer, type PortalTreeEntry } from './portals/PortalRenderer.js';
import { crossPose, findCrossing, type CrossableDoor, type Pose } from './portals/traversal.js';
import { QualityManager, type QualityMode } from './render/QualityManager.js';
import { createCamera, createRenderer } from './render/createRenderer.js';
import type { RoomView } from './rooms/buildRoom.js';
import { Emitter, type Unsubscribe } from './util/emitter.js';
import { clamp, deg, lerp } from './util/math.js';
import { World } from './world/World.js';

export { UnsupportedError } from './util/errors.js';
export type { Unsubscribe } from './util/emitter.js';
export type { PerfSummary } from './debug/PerfStats.js';
export type { PortalTreeEntry } from './portals/PortalRenderer.js';
export type { QualityMode } from './render/QualityManager.js';

/** Default mouse sensitivity (radians per pixel). */
export const DEFAULT_SENSITIVITY = 0.0022;
/** Pitch limit (radians). */
export const MAX_PITCH = deg(85);

/** A change of the current room: a door crossing, or a spawn/teleport (`door = null`). */
export interface RoomChange {
  from: RoomId | null;
  door: DoorId | null;
  to: RoomId;
}

/** Events the engine emits. */
export interface EngineEvents extends Record<string, unknown> {
  /** The player is now in another room. */
  roomChanged: RoomChange;
  /** A frame was rendered; `dt` is the frame delta in seconds. */
  frame: { dt: number };
  /** Pointer Lock was gained (true) or lost (false). */
  pointerLock: boolean;
  /** The WebGL context was lost (true) or restored (false). */
  contextLost: boolean;
  /** Portal quality level changed (0 = best). */
  quality: number;
}

/** Snapshot of the player for UI and tests. */
export interface EngineState {
  room: RoomId;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
}

/** Look settings (sensitivity in radians per pixel). */
export interface LookSettings {
  sensitivity: number;
  invertY: boolean;
}

/** Start-up options. */
export interface EngineOptions {
  /** Portal quality (default `auto`). */
  quality?: QualityMode;
  /** Tint portal levels and outline their rectangles (dev). */
  portalDebug?: boolean;
}

/** Runtime numbers for tests and the debug overlay. */
export interface EngineInfo {
  programs: number;
  passes: number;
  qualityLevel: number;
  qualityMode: QualityMode;
  contextLost: boolean;
  drawCalls: number;
}

const NO_INPUT: MoveIntent = { forward: false, back: false, left: false, right: false };

export class Engine {
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private portals: PortalRenderer | null = null;
  private debugOverlay: PortalDebugOverlay | null = null;
  private prewarmTarget: THREE.WebGLRenderTarget | null = null;
  private readonly world = new World();
  private readonly input = new InputState();
  private readonly clock = new FixedStepClock();
  private readonly events = new Emitter<EngineEvents>();
  private readonly perf = new PerfStats();
  private quality = new QualityManager('auto');
  private unbindInput: (() => void) | null = null;
  private readonly cleanups: (() => void)[] = [];

  private room: RoomId | null = null;
  private body: Body = { x: 0, z: 0, vx: 0, vz: 0 };
  private yaw = 0;
  private pitch = 0;
  private prev: Pose = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0 };
  private look: LookSettings = { sensitivity: DEFAULT_SENSITIVITY, invertY: false };

  private rafId: number | null = null;
  private lastFrameAt: number | null = null;
  private contextLost = false;
  /** Test hook mode: the loop renders but does not simulate; `debugStep` advances time. */
  private manual = false;
  private slowFrameMs = 0;
  private collidersCache: { room: RoomId; version: number; colliders: Collider[] } | null = null;

  /**
   * Creates the renderer on `canvas` and wires input.
   *
   * @throws UnsupportedError if WebGL2 is missing.
   */
  init(canvas: HTMLCanvasElement, options: EngineOptions = {}): void {
    if (this.renderer) throw new Error('Engine already initialised');
    const renderer = createRenderer(canvas);
    renderer.info.autoReset = false;
    this.renderer = renderer;
    this.canvas = canvas;
    this.camera = createCamera(1);
    this.portals = new PortalRenderer(renderer, (id) => this.world.get(id));
    this.quality = new QualityManager(options.quality ?? 'auto');
    this.applyQuality();
    if (options.portalDebug) {
      this.portals.settings.debugTint = true;
      this.debugOverlay = new PortalDebugOverlay(canvas);
    }
    this.resize();

    const onResize = (): void => {
      this.resize();
    };
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => {
      window.removeEventListener('resize', onResize);
    });

    const onLost = (e: Event): void => {
      e.preventDefault();
      this.contextLost = true;
      this.stop();
      this.events.emit('contextLost', true);
    };
    const onRestored = (): void => {
      this.restoreAfterContextLoss();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    this.cleanups.push(() => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    });

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
    this.compile(this.world.load(rooms));
  }

  /**
   * Puts the player in a loaded room at `spawn`, at rest.
   *
   * @throws Error if the room is not loaded.
   */
  setCurrentRoom(id: RoomId, spawn: Spawn): void {
    if (!this.world.get(id)) throw new Error(`Room ${id} is not loaded`);
    const from = this.room;
    this.room = id;
    this.body = { x: spawn.x, z: spawn.z, vx: 0, vz: 0 };
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.prev = this.pose();
    this.clock.reset();
    this.events.emit('roomChanged', { from, door: null, to: id });
  }

  /** Starts the render loop. */
  start(): void {
    if (this.rafId !== null || !this.renderer || this.contextLost) return;
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
    for (const fn of this.cleanups.splice(0)) fn();
    this.unbindInput?.();
    this.unbindInput = null;
    this.debugOverlay?.dispose();
    this.portals?.dispose();
    this.prewarmTarget?.dispose();
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
      vx: this.body.vx,
      vz: this.body.vz,
    };
  }

  /** Rolling performance statistics (for the `?perf=1` overlay). */
  getPerf(): PerfSummary {
    return this.perf.summary();
  }

  /** The last frame's portal tree (for goal audio in CP09 and the debug view in CP10). */
  getPortalTree(): readonly PortalTreeEntry[] {
    return this.portals?.getPortalTree() ?? [];
  }

  /** IDs of the loaded rooms. */
  loadedRooms(): RoomId[] {
    return this.world.ids();
  }

  /** Changes mouse sensitivity and Y inversion. */
  setLookSettings(settings: Partial<LookSettings>): void {
    this.look = { ...this.look, ...settings };
  }

  /** Sets the portal quality mode (`auto`, `high`, `low`). */
  setQuality(mode: QualityMode): void {
    this.quality.setMode(mode, performance.now());
    this.applyQuality();
  }

  // ------------------------------------------------------------ test and debug support

  /** Runtime numbers for tests and debugging. */
  debugInfo(): EngineInfo {
    return {
      programs: this.renderer?.info.programs?.length ?? 0,
      passes: this.portals?.passes ?? 0,
      qualityLevel: this.quality.level,
      qualityMode: this.quality.mode,
      contextLost: this.contextLost,
      drawCalls: this.renderer?.info.render.calls ?? 0,
    };
  }

  /**
   * Test hook: places the player at a pose (at rest) and switches to manual stepping, so
   * screenshots are deterministic. Throws if the room is not loaded.
   */
  debugSetPose(room: RoomId, x: number, z: number, yaw: number, pitch = 0): void {
    if (!this.world.get(room)) throw new Error(`Room ${room} is not loaded`);
    this.manual = true;
    const from = this.room;
    this.room = room;
    this.body = { x, z, vx: 0, vz: 0 };
    this.yaw = yaw;
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.prev = this.pose();
    if (from !== room) this.events.emit('roomChanged', { from, door: null, to: room });
    this.renderNow();
  }

  /** Test hook: advances `n` simulation steps with the given keys held (default none), then renders. */
  debugStep(n: number, keys: Partial<MoveIntent> = {}): void {
    this.manual = true;
    const intent = { ...NO_INPUT, ...keys };
    for (let i = 0; i < n; i++) {
      this.prev = this.pose();
      this.simulate(SIM_STEP, intent, false);
    }
    this.renderNow();
  }

  /** Dev toggle: adds a busy-wait of `ms` to every frame, to exercise automatic quality. */
  debugSlowFrames(ms: number): void {
    this.slowFrameMs = Math.max(0, ms);
  }

  /** Internals for dev-only checks (portal correctness test). Not for game code. */
  debugInternals(): {
    renderer: THREE.WebGLRenderer | null;
    camera: THREE.PerspectiveCamera | null;
    portals: PortalRenderer | null;
    room: RoomView | undefined;
    getRoom: (id: RoomId) => RoomView | undefined;
  } {
    return {
      renderer: this.renderer,
      camera: this.camera,
      portals: this.portals,
      room: this.room ? this.world.get(this.room) : undefined,
      getRoom: (id) => this.world.get(id),
    };
  }

  // ------------------------------------------------------------ internals

  private pose(): Pose {
    return {
      x: this.body.x,
      z: this.body.z,
      yaw: this.yaw,
      pitch: this.pitch,
      vx: this.body.vx,
      vz: this.body.vz,
    };
  }

  private applyQuality(): void {
    const portals = this.portals;
    if (!portals) return;
    const before = portals.settings;
    const next = { ...before, ...this.quality.settings };
    if (next.msaa !== before.msaa || next.level1Scale !== before.level1Scale) {
      portals.resetTargets();
    }
    portals.settings = next;
  }

  /** Compiles shader programs for screen and render-target passes, so rooms never hitch. */
  private compile(views: readonly RoomView[]): void {
    const { renderer, camera } = this;
    if (!renderer || !camera || views.length === 0) return;
    this.prewarmTarget ??= new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    for (const view of views) {
      renderer.compile(view.scene, camera);
      renderer.setRenderTarget(this.prewarmTarget);
      renderer.compile(view.scene, camera);
      renderer.setRenderTarget(null);
    }
  }

  private restoreAfterContextLoss(): void {
    // The old GPU objects died with the context; rebuild every room from its RoomDTO.
    this.collidersCache = null;
    this.prewarmTarget = null;
    this.portals?.abandonTargets();
    this.compile(this.world.rebuild());
    this.contextLost = false;
    this.events.emit('contextLost', false);
    this.start();
  }

  private resize(): void {
    const { renderer, camera, canvas } = this;
    if (!renderer || !camera || !canvas) return;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    this.portals?.resetTargets();
  }

  /** Colliders of the current room, plus blocks on linked doors whose target is not loaded. */
  private activeColliders(view: RoomView): Collider[] {
    const cache = this.collidersCache;
    if (cache?.room === view.id && cache.version === this.world.version) return cache.colliders;
    const colliders = [...view.colliders];
    for (const [id, block] of view.portalBlocks) {
      const link = view.doors.get(id)?.link;
      if (!link || !this.world.get(link.room)?.doors.has(link.door)) colliders.push(block);
    }
    this.collidersCache = { room: view.id, version: this.world.version, colliders };
    return colliders;
  }

  /** Linked doors of a room whose target room is loaded. */
  private crossableDoors(view: RoomView): CrossableDoor[] {
    const out: CrossableDoor[] = [];
    for (const [id, door] of view.doors) {
      if (!door.link) continue;
      const target = this.world.get(door.link.room)?.doors.get(door.link.door);
      if (target) out.push({ id, frame: door.frame, link: door.link, targetFrame: target.frame });
    }
    return out;
  }

  private simulate(dt: number, intent: MoveIntent, useLook: boolean): void {
    const view = this.room ? this.world.get(this.room) : undefined;
    if (!view) return;
    if (useLook) {
      const { dx, dy } = this.input.consumeLook();
      const s = this.look.sensitivity;
      this.yaw -= dx * s;
      this.pitch = clamp(this.pitch - dy * s * (this.look.invertY ? -1 : 1), -MAX_PITCH, MAX_PITCH);
    }
    const before = { x: this.body.x, z: this.body.z };
    this.body = stepBody(this.body, intent, this.yaw, dt, this.activeColliders(view));

    // Door crossing, after collision (CP03 T4).
    const door = findCrossing(before, this.body, EYE_HEIGHT, this.crossableDoors(view));
    if (!door) return;
    const now = crossPose(this.pose(), door.frame, door.targetFrame);
    this.prev = crossPose(this.prev, door.frame, door.targetFrame);
    this.body = { x: now.x, z: now.z, vx: now.vx, vz: now.vz };
    this.yaw = now.yaw;
    const from = view.id;
    this.room = door.link.room;
    this.events.emit('roomChanged', { from, door: door.id, to: door.link.room });
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    const dt = this.lastFrameAt === null ? 0 : (now - this.lastFrameAt) / 1000;
    this.lastFrameAt = now;

    if (this.slowFrameMs > 0) {
      const until = performance.now() + this.slowFrameMs;
      while (performance.now() < until) {
        // Busy-wait (dev toggle for the automatic quality test).
      }
    }

    let alpha = 1;
    if (!this.manual) {
      const advance = this.clock.advance(dt);
      alpha = advance.alpha;
      for (let i = 0; i < advance.steps; i++) {
        this.prev = this.pose();
        this.simulate(SIM_STEP, this.input.intent(), true);
      }
    }
    this.render(alpha);
    if (dt > 0) {
      const info = this.renderer?.info.render;
      this.perf.record(now, dt * 1000, {
        drawCalls: info?.calls ?? 0,
        triangles: info?.triangles ?? 0,
        passes: this.portals?.passes ?? 1,
      });
      if (this.quality.update(now, this.perf.summary().avgMs)) {
        this.applyQuality();
        this.events.emit('quality', this.quality.level);
      }
    }
    this.events.emit('frame', { dt });
  };

  private renderNow(): void {
    this.render(1);
  }

  private render(alpha: number): void {
    const { renderer, camera, portals } = this;
    const view = this.room ? this.world.get(this.room) : undefined;
    if (!renderer || !camera || !portals || !view || this.contextLost) return;
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
    renderer.info.reset();
    portals.render(view, camera);
    this.debugOverlay?.draw(portals.getPortalTree());
  }
}
