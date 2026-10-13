import type { RoomDTO, RoomId } from '@ogm/shared';
import { shortestPath } from '@ogm/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_GOAL, FIXTURE_ROOMS } from '../../dev/fixtures/index.js';
import { MockApi } from '../../dev/mockApi.js';
import type { EngineEvents, EngineState } from '../../engine/Engine.js';
import { ApiError, NetworkError, type GameApi } from '../../engine/net/api.js';
import { Emitter } from '../../engine/util/emitter.js';
import { hopDistances } from '../../engine/world/reach.js';
import { GameController, type GameEngine } from './controller.js';
import { INITIAL_GAME_STATE, useGame } from './store.js';

/** An engine without WebGL: records what the controller asks for. */
class FakeEngine implements GameEngine {
  readonly events = new Emitter<EngineEvents>();
  loaded = new Set<RoomId>();
  queued = new Set<RoomId>();
  room: RoomId = '';
  inputEnabled = true;
  locked = false;
  resets = 0;
  loadRooms(rooms: readonly RoomDTO[]) {
    for (const r of rooms) this.loaded.add(r.id);
  }
  queueRooms(rooms: readonly RoomDTO[]) {
    for (const r of rooms) if (!this.loaded.has(r.id)) this.queued.add(r.id);
  }
  hasRoom(id: RoomId) {
    return this.loaded.has(id);
  }
  resetWorld() {
    this.resets++;
    this.loaded.clear();
    this.queued.clear();
    this.room = '';
  }
  setCurrentRoom(id: RoomId) {
    const from = this.room || null;
    this.room = id;
    this.events.emit('roomChanged', { from, door: null, to: id });
  }
  start() {}
  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
  }
  lockPointer() {
    this.locked = true;
  }
  unlockPointer() {
    this.locked = false;
  }
  getState(): EngineState {
    return { room: this.room, x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0 };
  }
  on<K extends keyof EngineEvents>(event: K, cb: (p: EngineEvents[K]) => void) {
    return this.events.on(event, cb);
  }
  /** The player walks through a door. */
  cross(door: string) {
    const link = FIXTURE_ROOMS.find((r) => r.id === this.room)?.doors.find(
      (d) => d.id === door,
    )?.link;
    if (!link) throw new Error(`no link ${this.room}.${door}`);
    const from = this.room;
    this.room = link.room;
    this.events.emit('roomChanged', { from, door, to: link.room });
  }
}

const flushAsync = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('GameController (CP08 T5)', () => {
  let clock = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1000;
    useGame.setState({ ...INITIAL_GAME_STATE });
  });

  const make = (api: GameApi = new MockApi(0, () => clock)) => {
    const engine = new FakeEngine();
    const game = new GameController({ engine, api, now: () => clock });
    return { engine, game, api };
  };

  async function playToGoal(engine: FakeEngine) {
    const path = shortestPath(FIXTURE_ROOMS, engine.room, FIXTURE_GOAL) ?? [];
    for (const step of path) {
      if (step.exitDoor === null) break;
      clock += 3000;
      engine.cross(step.exitDoor);
      await flushAsync();
    }
  }

  it('title → newGame → loading → ready → playing → completing → result', async () => {
    const { engine, game } = make();
    game.toTitle();
    expect(useGame.getState().phase).toBe('title');
    game.toNewGame();
    expect(useGame.getState().phase).toBe('newGame');
    const creating = game.newGame({ mode: 'random', difficulty: 'medium' });
    expect(useGame.getState().phase).toBe('loading');
    await creating;
    const s = useGame.getState();
    expect(s).toMatchObject({ phase: 'ready', seed: 'M1-0000-0000', difficulty: 'medium' });
    // Every room within 3 hops of the start (the portal depth) is built; the rest is queued.
    const direct = new Set(
      hopDistances(new Map(FIXTURE_ROOMS.map((r) => [r.id, r])), 'r00', 3).keys(),
    );

    expect([...engine.loaded].sort()).toEqual([...direct].sort());
    expect([...engine.queued].every((r) => !direct.has(r))).toBe(true);
    expect(engine.room).toBe('r00');
    expect(engine.inputEnabled).toBe(false);

    game.begin();
    expect(useGame.getState().phase).toBe('playing');
    expect(engine.locked).toBe(true);
    expect(engine.inputEnabled).toBe(true);
    await flushAsync();

    await playToGoal(engine);
    const startedAt = useGame.getState().startedAt ?? 0;
    clock += 1234;
    engine.events.emit('goalReached', { room: FIXTURE_GOAL });
    expect(useGame.getState().phase).toBe('completing');
    expect(engine.inputEnabled).toBe(false);
    await flushAsync();
    const done = useGame.getState();
    expect(done.phase).toBe('result');
    expect(done.result?.completionMs).toBe(Math.floor(clock - startedAt));
    expect(done.result?.timeSource).toBe('client');
    expect(engine.locked).toBe(false);
  });

  it('the clock keeps running while paused (PD1): pointer loss changes nothing', async () => {
    const { engine, game } = make();
    await game.newGame({ mode: 'random', difficulty: 'easy' });
    game.begin();
    await flushAsync();
    engine.unlockPointer();
    clock += 60_000; // a minute in the pause overlay
    game.resume();
    await playToGoal(engine);
    const startedAt = useGame.getState().startedAt ?? 0;
    engine.events.emit('goalReached', { room: FIXTURE_GOAL });
    await flushAsync();
    expect(useGame.getState().result?.completionMs).toBe(Math.floor(clock - startedAt));
    expect(useGame.getState().result?.completionMs).toBeGreaterThan(60_000);
  });

  it('creation errors show the error screen; Retry tries again', async () => {
    const api = new MockApi(0, () => clock);
    let fail = true;
    const create = api.createGame.bind(api);
    vi.spyOn(api, 'createGame').mockImplementation((r) =>
      fail ? Promise.reject(new NetworkError('down')) : create(r),
    );
    const { game } = make(api);
    await game.newGame({ mode: 'random', difficulty: 'hard' });
    const s = useGame.getState();
    expect(s.phase).toBe('error');
    expect(s.error?.key).toBe('error.network');
    fail = false;
    s.error?.retry?.();
    await flushAsync();
    expect(useGame.getState().phase).toBe('ready');
  });

  it('maps server error codes to messages', async () => {
    const { game } = make();
    await game.newGame({ mode: 'seed', seed: 'nonsense' });
    expect(useGame.getState().error?.key).toBe('error.invalid_seed');
    await game.newGame({ mode: 'seed', seed: 'M9-7K2Q-X9MP' });
    expect(useGame.getState().error?.key).toBe('error.unsupported_version');
  });

  it('play this seed again: new game id, same seed', async () => {
    const { engine, game } = make();
    await game.newGame({ mode: 'seed', seed: 'H1-7K2Q-X9MP' });
    const first = useGame.getState().gameId;
    game.begin();
    await flushAsync();
    await playToGoal(engine);
    engine.events.emit('goalReached', { room: FIXTURE_GOAL });
    await flushAsync();
    expect(useGame.getState().result?.seed).toBe('H1-7K2Q-X9MP');
    await game.playAgain();
    const s = useGame.getState();
    expect(s.phase).toBe('ready');
    expect(s.seed).toBe('H1-7K2Q-X9MP');
    expect(s.gameId).not.toBe(first);
  });

  it('completion retries network failures behind "Saving result…"', async () => {
    const api = new MockApi(0, () => clock);
    let failures = 2;
    const complete = api.complete.bind(api);
    vi.spyOn(api, 'complete').mockImplementation((id, c) =>
      failures-- > 0 ? Promise.reject(new NetworkError('down')) : complete(id, c),
    );
    const { engine, game } = make(api);
    await game.newGame({ mode: 'random', difficulty: 'easy' });
    game.begin();
    await flushAsync();
    await playToGoal(engine);
    engine.events.emit('goalReached', { room: FIXTURE_GOAL });
    await flushAsync();
    expect(useGame.getState()).toMatchObject({ phase: 'completing', savingRetry: true });
    await flushAsync(5000);
    expect(useGame.getState().phase).toBe('result');
  });

  it('a non-retryable completion error shows the error screen', async () => {
    const api = new MockApi(0, () => clock);
    vi.spyOn(api, 'complete').mockRejectedValue(new ApiError(409, 'not_at_goal', 'x'));
    const { engine, game } = make(api);
    await game.newGame({ mode: 'random', difficulty: 'easy' });
    game.begin();
    await flushAsync();
    engine.events.emit('goalReached', { room: 'r00' });
    await flushAsync();
    expect(useGame.getState().error?.key).toBe('error.saveFailed');
  });

  it('safety net: fetches rooms within 3 hops that the server did not send', async () => {
    const api = new MockApi(0, () => clock);
    const create = api.createGame.bind(api);
    // Pretend the server only sent the start room and its direct neighbours.
    vi.spyOn(api, 'createGame').mockImplementation(async (r) => {
      const g = await create(r);
      const start = g.rooms.find((x) => x.id === g.startRoom);
      const near = new Set([
        g.startRoom,
        ...(start?.doors.flatMap((d) => (d.link ? [d.link.room] : [])) ?? []),
      ]);
      return { ...g, rooms: g.rooms.filter((x) => near.has(x.id)) };
    });
    const rooms = vi.spyOn(api, 'rooms');
    const { engine, game } = make(api);
    await game.newGame({ mode: 'random', difficulty: 'easy' });
    game.begin();
    await flushAsync();
    const before = new Set([...engine.loaded, ...engine.queued]);
    engine.cross('d0');
    await flushAsync();
    expect(rooms).toHaveBeenCalled();
    const after = new Set([...engine.loaded, ...engine.queued]);
    expect(after.size).toBeGreaterThan(before.size);
  });

  it('a desync is reported and flags the session; play continues', async () => {
    const api = new MockApi(0, () => clock);
    const report = vi.spyOn(api, 'reportError');
    const { engine, game } = make(api);
    await game.newGame({ mode: 'random', difficulty: 'easy' });
    game.begin();
    await flushAsync();
    // The engine claims a crossing from a room the server does not have the player in.
    engine.events.emit('roomChanged', { from: 'r03', door: 'd1', to: 'r05' });
    await flushAsync();
    expect(useGame.getState().desync).toBe(true);
    expect(report).toHaveBeenCalledWith('transition desync', expect.anything());
    expect(useGame.getState().phase).toBe('playing');
  });
});
