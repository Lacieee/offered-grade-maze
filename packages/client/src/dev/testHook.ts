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
  /** Game session state (CP08; only in the game, not in the dev scenes). */
  game?(): TestGameState;
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

/** Installs `window.__ogm`; returns a function that removes it. */
export function installTestHook(engine: Engine, game?: () => TestGameState): () => void {
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
    ...(game ? { game } : {}),
  };
  window.__ogm = hook;
  return () => {
    if (window.__ogm === hook) delete window.__ogm;
  };
}
