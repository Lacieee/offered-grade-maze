/**
 * Test hook (CP03 T7): `window.__ogm`, installed only in dev and test builds so Playwright
 * can take deterministic screenshots. Never part of a production bundle.
 */
import type { RoomDTO, RoomId } from '@ogm/shared';
import type {
  Engine,
  EngineInfo,
  EngineState,
  PortalTreeEntry,
  QualityMode,
} from '../engine/Engine.js';
import * as THREE from 'three';
import { HALO_SIZE } from '../engine/goal/GoalObject.js';
import { yawToward, type MoveIntent } from '../engine/player/physics.js';
import { portalCheck, type PortalCheckResult } from './portalCheck.js';

export interface OgmTestHook {
  getState(): EngineState;
  /** Places the player (at rest) and switches the engine to manual stepping. */
  setPose(room: RoomId, x: number, z: number, yaw: number, pitch?: number): void;
  /** Advances n simulation steps with no input (or the given keys held), then renders. */
  step(n: number, keys?: Partial<MoveIntent>): void;
  /** Renders the current step interpolated at alpha ∈ [0, 1] (a frame between two steps). */
  renderAt(alpha: number): void;
  info(): EngineInfo;
  portalTree(): { room: RoomId; level: number; rect: PortalTreeEntry['rect'] }[];
  setQuality(mode: QualityMode): void;
  slowFrames(ms: number): void;
  /** Compares a level-1 portal's image with a direct render of its target room. */
  portalCheck(door: string): PortalCheckResult;
  /** Sets the animation time (fish, TV static) in seconds and renders; it is 0 by default. */
  setAmbientTime(seconds: number): void;
  /** A built or queued room's DTO (CP08). */
  roomDto(id: RoomId): RoomDTO | undefined;
  /**
   * A pose `dist` metres into a built room straight in front of one of its doors, facing the
   * door (CP08: scripted walks through generated houses). Null if the room is not built.
   */
  doorPose(room: RoomId, door: string, dist: number): { x: number; z: number; yaw: number } | null;
  /** The last missing portal targets (`room.door→target (level n)`). */
  missingLog(): string[];
  /**
   * Where the goal appears on screen after the last render (CP09): CSS pixels of the canvas,
   * the halo's projected radius and the portal level it is seen at. Null unless the whole
   * diploma is in view: on screen, inside the doorways that show the goal room, and with no
   * furniture or wall in the way.
   */
  goalScreen(): GoalScreen | null;
  /**
   * The goal's (image) position in the current room's coordinates and the portal level it is
   * seen at, after the last render (as the hum uses it). Null when the goal room is not drawn.
   */
  goalSource(): { x: number; y: number; z: number; level: number } | null;
  /**
   * Draws the room surfaces (walls, floor, ceiling, door frames) black in every room, or
   * restores them (CP09: "the brightest object" ignores the surfaces). Call `renderAt` after.
   */
  maskSurfaces(on: boolean): void;
  /** Game session state (CP08; only in the game, not in the dev scenes). */
  game?(): TestGameState;
}

/** The goal's projection (CP09 brightness test). */
export interface GoalScreen {
  x: number;
  y: number;
  /** Projected halo radius (px). */
  radius: number;
  level: number;
  distance: number;
}

/** Game session state for tests (CP08). */
export interface TestGameState {
  phase: string;
  gameId: string | null;
  seed: string | null;
  /** The server's last_seq as the client knows it, and crossings still queued. */
  lastSeq: number;
  pending: number;
  desync: boolean;
  reconnecting: boolean;
}

declare global {
  interface Window {
    __ogm?: OgmTestHook;
  }
}

/** Mesh names of room surfaces (not objects). */
const SURFACES = new Set(['wall', 'floor', 'ceiling', 'doorframe', 'doorstep']);
const BLACK = new THREE.MeshBasicMaterial({ color: 0x000000 });

/** Half the diploma's length and height (with its ribbon tails), for the visibility rays. */
const GOAL_HALF_LENGTH = 0.22;
const GOAL_HALF_HEIGHT = 0.08;

/**
 * Whether a mesh of `scene` (not the goal, not a portal) lies on the segment `from`→`to`,
 * stopping 5 cm short of `to`.
 */
function blocked(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const length = from.distanceTo(to) - 0.05;
  if (length <= 0) return false;
  const meshes: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.name === 'goal') return;
    if (o instanceof THREE.Mesh && !o.name.startsWith('portal:') && !insideGoal(o)) {
      meshes.push(o);
    }
  });
  scene.updateMatrixWorld();
  const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, length);
  return ray.intersectObjects(meshes, false).length > 0;
}

function insideGoal(o: THREE.Object3D): boolean {
  for (let p = o.parent; p; p = p.parent) if (p.name === 'goal') return true;
  return false;
}

/** Installs `window.__ogm`; returns a function that removes it. */
export function installTestHook(engine: Engine, game?: () => TestGameState): () => void {
  const masked = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const hook: OgmTestHook = {
    getState: () => engine.getState(),
    setPose: (room, x, z, yaw, pitch = 0) => {
      engine.debugSetPose(room, x, z, yaw, pitch);
    },
    step: (n, keys) => {
      engine.debugStep(n, keys);
    },
    renderAt: (alpha) => {
      engine.debugRenderAt(alpha);
    },
    info: () => engine.debugInfo(),
    portalTree: () =>
      engine.getPortalTree().map((n) => ({ room: n.room, level: n.level, rect: n.rect })),
    setQuality: (mode) => {
      engine.setQuality(mode);
    },
    slowFrames: (ms) => {
      engine.debugSlowFrames(ms);
    },
    portalCheck: (door) => portalCheck(engine, door),
    setAmbientTime: (seconds) => {
      engine.debugSetAmbientTime(seconds);
    },
    roomDto: (id) => engine.roomDto(id),
    missingLog: () => [...(engine.debugInternals().portals?.missingLog ?? [])],
    doorPose: (room, door, dist) => {
      const frame = engine.debugInternals().getRoom(room)?.doors.get(door)?.frame;
      if (!frame) return null;
      const x = frame.origin.x + frame.inward.x * dist;
      const z = frame.origin.z + frame.inward.z * dist;
      return { x, z, yaw: yawToward(x, z, frame.origin.x, frame.origin.z) };
    },
    goalScreen: () => {
      const source = engine.getGoalSource();
      const camera = engine.getCamera();
      const canvas = engine.debugInternals().renderer?.domElement;
      if (!source || !camera || !canvas) return null;
      camera.updateMatrixWorld();
      const eye = camera.getWorldPosition(source.position.clone());
      const distance = eye.distanceTo(source.position);
      const ndc = source.position.clone().project(camera);
      const internals = engine.debugInternals();
      const goalView =
        internals.goalRoom === undefined ? undefined : internals.getRoom(internals.goalRoom);
      const here = internals.room;
      if (!goalView || !here) return null;
      // The whole diploma must be in view: its centre, both ends and above and below it.
      const toGoal = source.position.clone().sub(eye).setY(0).normalize();
      const across = new THREE.Vector3(-toGoal.z, 0, toGoal.x).multiplyScalar(GOAL_HALF_LENGTH);
      const up = new THREE.Vector3(0, GOAL_HALF_HEIGHT, 0);
      const samples = [
        source.position.clone(),
        source.position.clone().add(across),
        source.position.clone().sub(across),
        source.position.clone().add(up),
        source.position.clone().sub(up),
      ];
      const tree = engine.getPortalTree();
      let goalFromRoot: THREE.Matrix4 | null = null;
      for (const p of samples) {
        const s = p.clone().project(camera);
        if (s.z > 1 || Math.abs(s.x) > 1 || Math.abs(s.y) > 1) return null;
        // Nothing in the current room in the way.
        if (blocked(here.scene, eye, p)) return null;
        if (source.level === 0) {
          goalFromRoot = new THREE.Matrix4();
          continue;
        }
        // Through portals: inside the doorway(s) that show the goal room.
        const sx = (s.x + 1) / 2;
        const sy = (s.y + 1) / 2;
        const node = tree.find(
          (n) =>
            n.room === goalView.id &&
            n.level === source.level &&
            sx >= n.rect.x0 &&
            sx <= n.rect.x1 &&
            sy >= n.rect.y0 &&
            sy <= n.rect.y1,
        );
        if (!node) return null;
        goalFromRoot = node.cameraFromRoot;
      }
      if (!goalFromRoot) return null;
      // Nothing in the goal room in the way.
      const eyeThere = eye.clone().applyMatrix4(goalFromRoot);
      for (const p of samples) {
        if (blocked(goalView.scene, eyeThere, p.clone().applyMatrix4(goalFromRoot))) return null;
      }
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const focal = h / 2 / Math.tan((camera.fov * Math.PI) / 360);
      return {
        x: ((ndc.x + 1) / 2) * w,
        y: ((1 - ndc.y) / 2) * h,
        radius: ((HALO_SIZE / 2) * focal) / Math.max(0.01, distance),
        level: source.level,
        distance,
      };
    },
    goalSource: () => {
      const source = engine.getGoalSource();
      if (!source) return null;
      const { x, y, z } = source.position;
      return { x, y, z, level: source.level };
    },
    maskSurfaces: (on) => {
      for (const [mesh, material] of masked) mesh.material = material;
      masked.clear();
      if (!on) return;
      const internals = engine.debugInternals();
      for (const id of internals.roomIds()) {
        internals.getRoom(id)?.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || !SURFACES.has(o.name)) return;
          const mesh = o as THREE.Mesh;
          masked.set(mesh, mesh.material);
          mesh.material = BLACK;
        });
      }
    },
    ...(game ? { game } : {}),
  };
  window.__ogm = hook;
  return () => {
    if (window.__ogm === hook) delete window.__ogm;
  };
}
