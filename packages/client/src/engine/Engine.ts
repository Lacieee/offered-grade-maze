/**
 * The game engine: renderer, fixed-step loop, world, player, portals. Framework-free (no React).
 *
 * Usage: `init(canvas)` → `loadRooms(rooms)` → `setCurrentRoom(id, spawn)` → `start()`.
 */
import {
  EYE_HEIGHT,
  type DoorFrame,
  type DoorId,
  type FloorKind,
  type LinkDTO,
  type RoomDTO,
  type RoomId,
  type Spawn,
} from '@ogm/shared';
import * as THREE from 'three';
import { PerfStats, type PerfSummary } from './debug/PerfStats.js';
import { DoorLabels } from './debug/DoorLabels.js';
import { PortalDebugOverlay } from './debug/PortalDebugOverlay.js';
import { FixedStepClock, SIM_STEP } from './loop/FixedStepClock.js';
import { InputState, bindInput, requestPointerLock } from './player/input.js';
import { stepBody, type Body, type Collider, type MoveIntent } from './player/physics.js';
import { ambientTime } from './prefabs/animated.js';
import { PortalRenderer, type PortalTreeEntry } from './portals/PortalRenderer.js';
import {
  crossPose,
  findCrossing,
  keepEyeOffPortals,
  renderPose,
  type CrossableDoor,
  type LastCrossing,
  type Pose,
} from './portals/traversal.js';
import { QualityManager, type QualityMode } from './render/QualityManager.js';
import { createCamera, createRenderer } from './render/createRenderer.js';
import type { RoomView } from './rooms/buildRoom.js';
import { Emitter, type Unsubscribe } from './util/emitter.js';
import { clamp, deg, lerp } from './util/math.js';
import { FootstepTracker, type Side } from './audio/footsteps.js';
import { goalSource, type GoalSource } from './audio/goalSource.js';
import { PICKUP_SECONDS } from './goal/GoalObject.js';
import { RoomBuilder } from './world/RoomBuilder.js';
import { World } from './world/World.js';

export { UnsupportedError } from './util/errors.js';
export type { Unsubscribe } from './util/emitter.js';
export type { PerfSummary } from './debug/PerfStats.js';
export type { PortalTreeEntry } from './portals/PortalRenderer.js';
export type { QualityMode } from './render/QualityManager.js';

/** Default mouse sensitivity (radians per pixel). */
export const DEFAULT_SENSITIVITY = 0.0022;
/**
 * A single gap between frames longer than this (s) is a pause, not a slow frame: a hidden
 * tab, a window switch, a long hitch. It must not step portal quality down (CP06 review).
 * Back-to-back long frames are a slow machine and count as usual.
 */
export const PAUSE_GAP = 0.25;

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
  /** The player walked into the goal (PD2): horizontal distance below {@link GOAL_RADIUS}. */
  goalReached: { room: RoomId };
  /** A footstep (CP09 T3): every 1.3 m while walking, on the current room's floor. */
  footstep: { side: Side; floor: FloorKind };
}

/** Pickup distance from the goal, horizontally (m, CP08 T5). */
export const GOAL_RADIUS = 0.9;

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

/** What a program driving the input (the autopilot, CP10 A3) sees before each step. */
export interface DriverState {
  room: RoomId;
  x: number;
  z: number;
  yaw: number;
  /** Simulation step length (s). */
  dt: number;
}

/**
 * Called before every simulation step while input is enabled. It drives the normal input
 * system (`InputState.drive` and `turn`), so movement, collision, crossing and streaming run
 * exactly as for a player.
 */
export type InputDriver = (state: DriverState, input: DriverInput) => void;

/** The part of the input system a driver may use. */
export interface DriverInput {
  drive(keys: Partial<MoveIntent> | null): void;
  turn(radians: number): void;
}

/** A room's walkable geometry in its own coordinates (for path planning, CP10 A3). */
export interface RoomGeometry {
  id: RoomId;
  width: number;
  depth: number;
  colliders: readonly Collider[];
  /** `open`: linked, and the target room is built (it can be walked into now). */
  doors: { id: DoorId; frame: DoorFrame; link: LinkDTO | null; open: boolean }[];
  goal: { x: number; z: number } | null;
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
  /**
   * Visible linked doors whose target room was not built yet, summed over all frames since
   * the last reset (CP08 T4). They show the fallback colour; streaming should keep it at 0.
   */
  missingPortalTargets: number;
  /** Rooms received but not built yet. */
  pendingRooms: number;
  /**
   * Shader programs compiled while rendering (not prewarmed when a room was built), summed
   * since start: each one is a hitch (CP10 B1).
   */
  renderCompiles: number;
  /** Player settings as applied (CP09 T7). */
  fov: number;
  sensitivity: number;
  invertY: boolean;
  headBob: boolean;
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
  private readonly builder = new RoomBuilder({
    isBuilt: (id) => this.world.has(id),
    build: (dto) => {
      this.compile(this.world.load([dto]));
    },
    current: () => this.room,
    known: (id) => this.world.get(id)?.dto,
  });
  private inputEnabled = true;
  private goalFired = false;
  private readonly steps = new FootstepTracker();
  private headBob = true;
  /** The running pickup animation (CP09 T1.6). */
  private pickup: { start: number; done: () => void } | null = null;
  private readonly input = new InputState();
  private driver: InputDriver | null = null;
  private renderCompiles = 0;
  /** In-world door labels of the debug view (CP10 A2), or null when off. */
  private doorLabels: DoorLabels | null = null;
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
  /** The previous frame came after a pause (see {@link PAUSE_GAP}). */
  private lastFramePaused = false;
  /** Render interpolation factor used in manual (test hook) mode. */
  private manualAlpha = 1;
  /** The crossing made in the last simulation step (render interpolation spans it). */
  private lastCrossing: LastCrossing | null = null;
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

  /** Builds and caches rooms by ID now (already cached rooms are skipped). */
  loadRooms(rooms: readonly RoomDTO[]): void {
    this.compile(this.world.load(rooms));
  }

  /**
   * Queues rooms for background building (CP08 T4): one per idle slot, nearest to the player
   * first. Rooms already built or queued are skipped.
   */
  queueRooms(rooms: readonly RoomDTO[]): void {
    this.builder.enqueue(rooms);
  }

  /** True if the room is built. */
  hasRoom(id: RoomId): boolean {
    return this.world.has(id);
  }

  /** The DTO of a built or queued room. */
  roomDto(id: RoomId): RoomDTO | undefined {
    return this.world.get(id)?.dto ?? this.builder.get(id);
  }

  /**
   * Stops the loop and drops every room, built or queued, for the next game. The renderer
   * and its compiled shader programs stay.
   */
  resetWorld(): void {
    this.stop();
    this.builder.clear();
    this.doorLabels?.dispose();
    this.world.dispose();
    this.room = null;
    this.collidersCache = null;
    this.lastCrossing = null;
    this.goalFired = false;
    this.inputEnabled = true;
    this.manual = false;
    this.steps.reset();
    this.pickup?.done();
    this.pickup = null;
    this.portals?.resetMissingTargets();
  }

  /** Vertical field of view (degrees, CP09 T7). */
  setFov(degrees: number): void {
    const camera = this.camera;
    if (!camera) return;
    camera.fov = clamp(degrees, 30, 120);
    camera.updateProjectionMatrix();
  }

  /** Head bob on or off (CP09 T3.5). */
  setHeadBob(enabled: boolean): void {
    this.headBob = enabled;
  }

  /** The camera (the audio listener follows it). */
  getCamera(): THREE.PerspectiveCamera | null {
    return this.camera;
  }

  /**
   * Where the goal hum comes from this frame (CP09 T5): the diploma in the goal room, or its
   * image through the shallowest portal that shows the goal room; null if not seen.
   */
  getGoalSource(): GoalSource | null {
    const goalView = this.world.goalRoom();
    if (!goalView?.goal || !this.room) return null;
    return goalSource(
      this.room,
      goalView.id,
      goalView.goal.worldPosition(),
      this.portals?.getPortalTree() ?? [],
    );
  }

  /**
   * Plays the pickup (CP09 T1.6): over 0.6 s the diploma flies toward the camera, grows and
   * fades. Resolves when it has finished.
   */
  playPickup(): Promise<void> {
    const goal = this.world.goalRoom()?.goal;
    if (!goal || this.pickup) return Promise.resolve();
    return new Promise((resolve) => {
      this.pickup = { start: performance.now(), done: resolve };
    });
  }

  /** Enables or freezes player input (frozen during the pickup, CP08 T5). */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.input.clear();
      this.body = { ...this.body, vx: 0, vz: 0 };
    }
  }

  /** Requests Pointer Lock on the canvas (call from a user gesture). */
  lockPointer(): void {
    if (this.canvas) void requestPointerLock(this.canvas);
  }

  /** Releases Pointer Lock. */
  unlockPointer(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
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
    this.lastCrossing = null;
    this.goalFired = false;
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
    this.builder.clear();
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

  /**
   * Installs (or with `null` removes) a program that drives the input every simulation step
   * (the autopilot, CP10 A3). Removing it releases its keys.
   */
  setDriver(driver: InputDriver | null): void {
    this.driver = driver;
    if (!driver) this.input.drive(null);
    // A driver plays in real time: leave the test hook's manual stepping.
    else if (this.manual) {
      this.manual = false;
      this.lastFrameAt = null;
    }
  }

  /**
   * Debug view (CP10 A2): floating `d1 → r07.d2` labels above every door frame, in every
   * built room (and every room built later), so portals show them too.
   */
  setDoorLabels(on: boolean, sealedText = 'sealed'): void {
    const views = this.world.ids().flatMap((id) => {
      const v = this.world.get(id);
      return v ? [v] : [];
    });
    this.doorLabels?.detachAll(views);
    this.doorLabels = null;
    if (!on) return;
    this.doorLabels = new DoorLabels(sealedText);
    for (const v of views) this.doorLabels.attach(v);
    this.compile(views);
  }

  /** A loaded room's walkable geometry, or undefined if it is not built. */
  roomGeometry(id: RoomId): RoomGeometry | undefined {
    const view = this.world.get(id);
    if (!view) return undefined;
    return {
      id,
      width: view.dto.width,
      depth: view.dto.depth,
      colliders: view.colliders,
      doors: [...view.doors].map(([doorId, d]) => ({
        id: doorId,
        frame: d.frame,
        link: d.link,
        open: this.world.enterableTarget(d.link) !== undefined,
      })),
      goal: view.dto.goal ? { x: view.dto.goal.x, z: view.dto.goal.z } : null,
    };
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
      missingPortalTargets: this.portals?.missingTargets ?? 0,
      pendingRooms: this.builder.size,
      renderCompiles: this.renderCompiles,
      fov: this.camera?.fov ?? 0,
      sensitivity: this.look.sensitivity,
      invertY: this.look.invertY,
      headBob: this.headBob,
    };
  }

  /**
   * Test hook: places the player at a pose (at rest) and switches to manual stepping, so
   * screenshots are deterministic. Throws if the room is not loaded.
   */
  debugSetPose(room: RoomId, x: number, z: number, yaw: number, pitch = 0): void {
    if (!this.world.get(room)) throw new Error(`Room ${room} is not loaded`);
    this.enterManual();
    const from = this.room;
    this.room = room;
    this.body = { x, z, vx: 0, vz: 0 };
    this.yaw = yaw;
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.prev = this.pose();
    this.lastCrossing = null;
    this.manualAlpha = 1;
    if (from !== room) this.events.emit('roomChanged', { from, door: null, to: room });
    this.renderNow();
  }

  /** Test hook: advances `n` simulation steps with the given keys held (default none), then renders. */
  debugStep(n: number, keys: Partial<MoveIntent> = {}): void {
    this.enterManual();
    const intent = { ...NO_INPUT, ...keys };
    for (let i = 0; i < n; i++) {
      this.prev = this.pose();
      this.lastCrossing = null;
      this.simulate(SIM_STEP, intent, false);
    }
    this.manualAlpha = 1;
    this.renderNow();
  }

  /**
   * Test hook: renders (and keeps rendering) the current step interpolated at `alpha`
   * between the previous and current simulation state, as a real frame between two steps.
   */
  debugRenderAt(alpha: number): void {
    this.enterManual();
    this.manualAlpha = clamp(alpha, 0, 1);
    this.render(this.manualAlpha);
  }

  /**
   * Test hook: sets the time of the fish and TV static and renders. In manual mode (any test
   * hook call) that time stands still; it starts at 0.
   */
  debugSetAmbientTime(seconds: number): void {
    this.enterManual();
    ambientTime.value = seconds;
    this.render(this.manualAlpha);
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
    roomIds: () => RoomId[];
    goalRoom: RoomId | undefined;
  } {
    return {
      renderer: this.renderer,
      camera: this.camera,
      portals: this.portals,
      room: this.room ? this.world.get(this.room) : undefined,
      getRoom: (id) => this.world.get(id),
      roomIds: () => this.world.ids(),
      goalRoom: this.world.goalRoom()?.id,
    };
  }

  // ------------------------------------------------------------ internals

  /** Switches to test-hook stepping; animations freeze at time 0 so screenshots repeat. */
  private enterManual(): void {
    if (this.manual) return;
    this.manual = true;
    ambientTime.value = 0;
  }

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
    if (
      next.msaa !== before.msaa ||
      next.level1Scale !== before.level1Scale ||
      next.deepScale !== before.deepScale
    ) {
      portals.resetTargets();
    }
    portals.settings = next;
  }

  /** Compiles shader programs for screen and render-target passes, so rooms never hitch. */
  private compile(views: readonly RoomView[]): void {
    const { renderer, camera } = this;
    if (this.doorLabels) for (const view of views) this.doorLabels.attach(view);
    if (!renderer || !camera || views.length === 0) return;
    this.prewarmTarget ??= new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    for (const view of views) {
      renderer.compile(view.scene, camera);
      renderer.setRenderTarget(this.prewarmTarget);
      renderer.compile(view.scene, camera);
      renderer.setRenderTarget(null);
      // Upload floor and painting textures now, not on the frame a portal first shows them.
      view.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials as THREE.Material[]) {
          const map =
            m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshBasicMaterial
              ? m.map
              : null;
          if (map) renderer.initTexture(map);
        }
      });
    }
  }

  private restoreAfterContextLoss(): void {
    // The old GPU objects died with the context; rebuild every room from its RoomDTO.
    this.collidersCache = null;
    this.prewarmTarget = null;
    this.portals?.abandonTargets();
    // The rebuilt rooms get fresh labels (the old ones died with their scenes).
    this.doorLabels?.dispose();
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

  /** Colliders of the current room, plus blocks on linked doors that cannot be entered. */
  private activeColliders(view: RoomView): Collider[] {
    const cache = this.collidersCache;
    if (cache?.room === view.id && cache.version === this.world.version) return cache.colliders;
    const colliders = [...view.colliders];
    for (const [id, block] of view.portalBlocks) {
      const link = view.doors.get(id)?.link ?? null;
      if (!this.world.enterableTarget(link)) colliders.push(block);
    }
    this.collidersCache = { room: view.id, version: this.world.version, colliders };
    return colliders;
  }

  /** Linked doors of a room whose target room is loaded. */
  private crossableDoors(view: RoomView): CrossableDoor[] {
    const out: CrossableDoor[] = [];
    for (const [id, door] of view.doors) {
      if (!door.link) continue;
      const target = this.world.enterableTarget(door.link);
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
      this.yaw += this.input.consumeTurn();
      this.pitch = clamp(this.pitch - dy * s * (this.look.invertY ? -1 : 1), -MAX_PITCH, MAX_PITCH);
    }
    const before = { x: this.body.x, z: this.body.z };
    this.body = stepBody(this.body, intent, this.yaw, dt, this.activeColliders(view));
    const side = this.steps.advance(
      Math.hypot(this.body.x - before.x, this.body.z - before.z),
      Math.hypot(this.body.vx, this.body.vz),
    );
    if (side) this.events.emit('footstep', { side, floor: view.dto.floor });

    // Door crossing, after collision (CP03 T4).
    const door = findCrossing(before, this.body, EYE_HEIGHT, this.crossableDoors(view));
    if (!door) {
      this.checkGoal(view.dto);
      return;
    }
    const now = crossPose(this.pose(), door.frame, door.targetFrame);
    this.prev = crossPose(this.prev, door.frame, door.targetFrame);
    this.body = { x: now.x, z: now.z, vx: now.vx, vz: now.vz };
    this.yaw = now.yaw;
    this.lastCrossing = { fromRoom: view.id, fromFrame: door.frame, toFrame: door.targetFrame };
    const from = view.id;
    this.room = door.link.room;
    this.events.emit('roomChanged', { from, door: door.id, to: door.link.room });
    const arrived = this.world.get(door.link.room);
    if (arrived) this.checkGoal(arrived.dto);
  }

  /** Moves the goal to this frame's time, or along the pickup (one update per frame). */
  private animateGoal(eye: THREE.Vector3): void {
    const goal = this.world.goalRoom()?.goal;
    if (!goal) return;
    if (this.pickup) {
      const p = (performance.now() - this.pickup.start) / (PICKUP_SECONDS * 1000);
      goal.pickup(p, eye);
      if (p >= 1) {
        const { done } = this.pickup;
        this.pickup = null;
        done();
      }
      return;
    }
    goal.update(ambientTime.value);
  }

  /** Emits `goalReached` once when the player stands within reach of the room's goal. */
  private checkGoal(dto: RoomDTO): void {
    const goal = dto.goal;
    if (!goal || this.goalFired) return;
    if (Math.hypot(this.body.x - goal.x, this.body.z - goal.z) >= GOAL_RADIUS) return;
    this.goalFired = true;
    this.events.emit('goalReached', { room: dto.id });
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

    let alpha = this.manualAlpha;
    if (!this.manual) {
      ambientTime.value += dt;
      const advance = this.clock.advance(dt);
      alpha = advance.alpha;
      for (let i = 0; i < advance.steps; i++) {
        this.prev = this.pose();
        this.lastCrossing = null;
        if (this.inputEnabled) {
          if (this.driver && this.room) {
            this.driver(
              { room: this.room, x: this.body.x, z: this.body.z, yaw: this.yaw, dt: SIM_STEP },
              this.input,
            );
          }
          this.simulate(SIM_STEP, this.input.intent(), true);
        } else {
          // Frozen (pickup): drop mouse movement instead of applying it later.
          this.input.consumeLook();
          this.simulate(SIM_STEP, NO_INPUT, false);
        }
      }
    }
    this.render(alpha);
    const paused = dt > PAUSE_GAP && !this.lastFramePaused;
    this.lastFramePaused = paused;
    if (paused) {
      this.perf.reset();
      this.quality.pause(now);
    } else if (dt > 0) {
      const info = this.renderer?.info.render;
      this.perf.record(now, dt * 1000, {
        drawCalls: info?.calls ?? 0,
        triangles: info?.triangles ?? 0,
        passes: this.portals?.passes ?? 1,
      });
      const summary = this.perf.summary();
      if (this.quality.update(now, summary.avgMs, summary.refreshMs)) {
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
    if (!renderer || !camera || !portals || !this.room || this.contextLost) return;
    const cur = this.pose();
    const interpolated: Pose = {
      x: lerp(this.prev.x, cur.x, alpha),
      z: lerp(this.prev.z, cur.z, alpha),
      yaw: lerp(this.prev.yaw, cur.yaw, alpha),
      pitch: lerp(this.prev.pitch, cur.pitch, alpha),
      vx: 0,
      vz: 0,
    };
    // Between the two states of a crossing step the eye may still be on the old side of the
    // door: render that frame from the room it is really in (no fallback-colour flash).
    const { room, pose } = renderPose(interpolated, this.room, this.lastCrossing);
    const view = this.world.get(room);
    if (!view) return;
    const linked = [...view.doors.values()].filter((d) => d.link !== null).map((d) => d.frame);
    const eye = keepEyeOffPortals(pose.x, pose.z, linked);
    // Head bob (CP09 T3.5); off in test-hook mode, so scripted screenshots stay comparable.
    const bob = this.headBob && !this.manual ? this.steps.bobOffset() : 0;
    camera.position.set(eye.x, EYE_HEIGHT + bob, eye.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
    camera.updateMatrixWorld();
    this.animateGoal(camera.position);
    renderer.info.reset();
    const programs = renderer.info.programs?.length ?? 0;
    portals.render(view, camera);
    this.renderCompiles += Math.max(0, (renderer.info.programs?.length ?? 0) - programs);
    this.debugOverlay?.draw(portals.getPortalTree());
  }
}
