/**
 * Game controller (CP08 T5): title → newGame → loading → ready → playing → completing →
 * result, plus error. It connects the engine, the API, the transition queue and the room
 * stream, and writes the UI state.
 */
import {
  type CreateGameRequest,
  type CreateGameResponse,
  type RoomDTO,
  type RoomId,
  type Spawn,
} from '@ogm/shared';
import type { EngineEvents, EngineState, Unsubscribe } from '../../engine/Engine.js';
import { ApiError, NetworkError, isRetryable, type GameApi } from '../../engine/net/api.js';
import { TransitionQueue, backoffMs } from '../../engine/net/transitionQueue.js';
import { hopDistances, missingWithin } from '../../engine/world/reach.js';
import { isMessageKey, type MessageKey } from '../i18n/index.js';
import { INITIAL_GAME_STATE, useGame, type GameState, type NewGameTab } from './store.js';

/** What the controller needs from the engine (the real `Engine`, or a fake in tests). */
export interface GameEngine {
  loadRooms(rooms: readonly RoomDTO[]): void;
  queueRooms(rooms: readonly RoomDTO[]): void;
  hasRoom(id: RoomId): boolean;
  resetWorld(): void;
  setCurrentRoom(id: RoomId, spawn: Spawn): void;
  start(): void;
  setInputEnabled(enabled: boolean): void;
  lockPointer(): void;
  unlockPointer(): void;
  getState(): EngineState;
  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): Unsubscribe;
}

/** Safety net: rooms within this many hops of the player must be cached (CP08 T4). */
export const SAFETY_HOPS = 3;

export interface ControllerDeps {
  engine: GameEngine;
  api: GameApi;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** State writer (defaults to the zustand store). */
  setState?: (patch: Partial<GameState>) => void;
  getState?: () => GameState;
}

export class GameController {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly set: (patch: Partial<GameState>) => void;
  private readonly get: () => GameState;
  private readonly offs: Unsubscribe[] = [];
  /** Every room DTO received in this game (built or queued). */
  private known = new Map<RoomId, RoomDTO>();
  private requested = new Set<RoomId>();
  private queue: TransitionQueue | null = null;
  /** Increases with every new game, so late async results of an old game are ignored. */
  private generation = 0;
  private lastRequest: CreateGameRequest | null = null;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.sleep =
      deps.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
    this.set =
      deps.setState ??
      ((patch) => {
        useGame.setState(patch);
      });
    this.get = deps.getState ?? (() => useGame.getState());
    this.offs.push(
      deps.engine.on('roomChanged', (c) => {
        this.onRoomChanged(c.from, c.door, c.to);
      }),
      deps.engine.on('goalReached', () => {
        void this.onGoalReached();
      }),
    );
  }

  /** Unsubscribes from the engine. */
  dispose(): void {
    this.abandon();
    for (const off of this.offs.splice(0)) off();
  }

  /** Title screen. */
  toTitle(): void {
    this.abandon();
    this.deps.engine.unlockPointer();
    this.deps.engine.resetWorld();
    this.set({ ...INITIAL_GAME_STATE, phase: 'title' });
  }

  /** New game screen (optionally on a tab with a prefilled seed). */
  toNewGame(tab: NewGameTab = 'random', seedInput = ''): void {
    this.abandon();
    this.set({ phase: 'newGame', newGameTab: tab, seedInput, error: null });
  }

  /** Creates a game and builds its start rooms (loading → ready). */
  async newGame(request: CreateGameRequest): Promise<void> {
    this.abandon();
    const gen = ++this.generation;
    this.lastRequest = request;
    this.deps.engine.resetWorld();
    this.known = new Map();
    this.requested = new Set();
    this.set({
      ...INITIAL_GAME_STATE,
      phase: 'loading',
      seed: request.mode === 'seed' ? request.seed.trim().toUpperCase() : null,
      difficulty: request.mode === 'random' ? request.difficulty : null,
    });
    let game: CreateGameResponse;
    try {
      game = await this.deps.api.createGame(request);
    } catch (err) {
      if (gen !== this.generation) return;
      this.set({
        phase: 'error',
        error: {
          key: errorKey(err),
          ...(err instanceof Error ? { detail: err.message } : {}),
          retry: () => void this.newGame(request),
        },
      });
      return;
    }
    if (gen !== this.generation) return;

    for (const r of game.rooms) this.known.set(r.id, r);
    // Build every room the renderer can show from the start (3 portal levels) now, behind the
    // loading screen; the rest streams in the background. CP08 T5 asks for at least the start
    // room and its direct link targets: those alone left level-2 portals unbuilt for the
    // first seconds on slow GPUs.
    const first = new Set(hopDistances(this.known, game.startRoom, SAFETY_HOPS).keys());
    this.deps.engine.loadRooms(game.rooms.filter((r) => first.has(r.id)));
    this.deps.engine.queueRooms(game.rooms.filter((r) => !first.has(r.id)));
    this.deps.engine.setCurrentRoom(game.startRoom, game.spawn);
    this.deps.engine.setInputEnabled(false);
    this.deps.engine.start();
    this.set({
      phase: 'ready',
      gameId: game.gameId,
      seed: game.seed,
      difficulty: game.difficulty,
    });
  }

  /** Starts a new game with the same seed (new game id, same house). */
  async playAgain(): Promise<void> {
    const seed = this.get().result?.seed ?? this.get().seed;
    if (seed) await this.newGame({ mode: 'seed', seed });
  }

  /** Retries the last failed creation. */
  async retry(): Promise<void> {
    if (this.lastRequest) await this.newGame(this.lastRequest);
  }

  /** The Ready click: lock the pointer, start the clock and the server game (playing). */
  begin(): void {
    const s = this.get();
    if (s.phase !== 'ready' || !s.gameId) return;
    const gameId = s.gameId;
    const gen = this.generation;
    this.deps.engine.lockPointer();
    this.deps.engine.setInputEnabled(true);
    const startedAt = this.now();
    const started = this.retrying(() => this.deps.api.startGame(gameId), gen);
    started.catch((err: unknown) => {
      if (gen !== this.generation) return;
      this.deps.api.reportError('start failed', { gameId, error: String(err) });
      this.deps.engine.unlockPointer();
      this.set({
        phase: 'error',
        error: { key: errorKey(err), detail: String(err), retry: null },
      });
    });
    this.queue = new TransitionQueue({
      api: this.deps.api,
      gameId,
      ready: started,
      onRooms: (rooms) => {
        if (gen === this.generation) this.receive(rooms);
      },
      onAccepted: () => {
        if (gen === this.generation) void this.ensureNearby();
      },
      onDesync: (t, server) => {
        if (gen !== this.generation) return;
        this.deps.api.reportError('transition desync', {
          gameId,
          transition: t,
          server,
        });
        this.set({ desync: true });
        this.resync(server?.current ?? null);
      },
      onReconnecting: (on) => {
        if (gen === this.generation) this.set({ reconnecting: on });
      },
    });
    this.set({ phase: 'playing', startedAt });
  }

  /** Back to the game after the pause overlay (call from a user gesture). */
  resume(): void {
    if (this.get().phase === 'playing') this.deps.engine.lockPointer();
  }

  /** The current transition queue (tests). */
  get transitions(): TransitionQueue | null {
    return this.queue;
  }

  // ---------------------------------------------------------------- events

  private onRoomChanged(from: RoomId | null, door: string | null, to: RoomId): void {
    const s = this.get();
    if (s.phase !== 'playing' || from === null || door === null || s.startedAt === null) return;
    this.queue?.enqueue(from, door, this.now() - s.startedAt);
    void this.ensureNearby(to);
  }

  private async onGoalReached(): Promise<void> {
    const s = this.get();
    if (s.phase !== 'playing' || !s.gameId || s.startedAt === null || !this.queue) return;
    const gen = this.generation;
    const gameId = s.gameId;
    const stoppedAt = this.now();
    // The time is taken at the pickup; saving it does not add to it.
    const clientElapsedMs = Math.floor(stoppedAt - s.startedAt);
    this.deps.engine.setInputEnabled(false);
    this.set({ phase: 'completing', stoppedAt });
    const queue = this.queue;

    for (let attempt = 1; ; attempt++) {
      await queue.flush();
      if (gen !== this.generation) return;
      try {
        const { result } = await this.deps.api.complete(gameId, {
          lastSeq: queue.lastSeq,
          clientElapsedMs,
          debugUsed: this.get().debugUsed,
        });
        if (gen !== this.generation) return;
        queue.stop();
        this.deps.engine.unlockPointer();
        this.set({ phase: 'result', result, savingRetry: false, reconnecting: false });
        return;
      } catch (err) {
        if (gen !== this.generation) return;
        const pending = err instanceof ApiError && err.code === 'pending_transitions';
        if (!pending && !isRetryable(err)) {
          queue.stop();
          this.deps.engine.unlockPointer();
          this.deps.api.reportError('completion failed', {
            gameId,
            error: err instanceof Error ? err.message : String(err),
          });
          this.set({
            phase: 'error',
            error: {
              key: 'error.saveFailed',
              ...(err instanceof Error ? { detail: err.message } : {}),
              retry: null,
            },
          });
          return;
        }
        this.set({ savingRetry: true });
        await this.sleep(backoffMs(attempt));
      }
    }
  }

  // ---------------------------------------------------------------- streaming

  private receive(rooms: readonly RoomDTO[]): void {
    const fresh = rooms.filter((r) => !this.known.has(r.id));
    for (const r of fresh) {
      this.known.set(r.id, r);
      this.requested.delete(r.id);
    }
    if (fresh.length > 0) this.deps.engine.queueRooms(fresh);
  }

  /**
   * Safety net (CP08 T4): every room within 3 hops of the player must be known; fetch any
   * missing one. Waits until the server has every crossing (otherwise it may still think the
   * player is elsewhere and refuse the rooms); the queue calls it again after each success.
   */
  private async ensureNearby(current: RoomId = this.deps.engine.getState().room): Promise<void> {
    const gameId = this.get().gameId;
    if (!gameId || !current || (this.queue?.pending ?? 0) > 0) return;
    const missing = missingWithin(this.known, current, SAFETY_HOPS).filter(
      (id) => !this.requested.has(id),
    );
    if (missing.length === 0) return;
    for (const id of missing) this.requested.add(id);
    const gen = this.generation;
    try {
      const rooms = await this.deps.api.rooms(gameId, missing.slice(0, 24));
      if (gen === this.generation) this.receive(rooms);
    } catch {
      // Try again after the next crossing.
      for (const id of missing) this.requested.delete(id);
    }
  }

  /**
   * After a rejected crossing, the server's current room is authoritative: once nothing else
   * is queued, a player standing elsewhere is moved to the centre of the server's room so
   * later crossings are accepted again.
   */
  private resync(serverRoom: RoomId | null): void {
    if (serverRoom === null || (this.queue?.pending ?? 0) > 0) return;
    const here = this.deps.engine.getState().room;
    if (here === serverRoom || !this.deps.engine.hasRoom(serverRoom)) return;
    this.deps.engine.setCurrentRoom(serverRoom, { x: 0, z: 0, yaw: 0 });
  }

  /** Runs `fn` until it succeeds, retrying network trouble with backoff. */
  private async retrying<T>(fn: () => Promise<T>, gen: number): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (gen !== this.generation || !isRetryable(err)) throw err;
        await this.sleep(backoffMs(attempt));
      }
    }
  }

  /** Stops the current game's background work. */
  private abandon(): void {
    this.generation++;
    this.queue?.stop();
    this.queue = null;
  }
}

/** The message key for a creation error. */
export function errorKey(err: unknown): MessageKey {
  if (err instanceof NetworkError) return 'error.network';
  if (err instanceof ApiError) {
    const key = `error.${err.code}`;
    return isMessageKey(key) ? key : 'error.generic';
  }
  return 'error.generic';
}
