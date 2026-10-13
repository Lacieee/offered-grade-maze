/**
 * In-browser mock of the game API over the CP02 fixture house (CP08 T3): `?mock=1`, dev
 * builds only. Start r00, goal r05; `?latency=300` delays every response by 300 ms. It applies
 * the server's rules (CP07 T4–T6) so the UI and e2e tests can run without a server. It must
 * not import `@ogm/generator`.
 */
import {
  parseSeed,
  shortestPath,
  type CompleteRequest,
  type CompleteResponse,
  type CreateGameRequest,
  type CreateGameResponse,
  type DebugResponse,
  type Difficulty,
  type ResultDTO,
  type RoomDTO,
  type RoomId,
  type StartResponse,
  type TransitionRequest,
  type TransitionResponse,
} from '@ogm/shared';
import { ApiError, type GameApi } from '../engine/net/api.js';
import { hopDistances } from '../engine/world/reach.js';
import { FIXTURE_GOAL, FIXTURE_ROOMS, FIXTURE_START, fixtureSpawn } from './fixtures/index.js';

/** Same radius as the server's default `PREFETCH_RADIUS`. */
const RADIUS = 4;
/** Canonical seed per difficulty (every seed plays the fixture house). */
const SEEDS: Record<Difficulty, string> = {
  easy: 'E1-0000-0000',
  medium: 'M1-0000-0000',
  hard: 'H1-0000-0000',
};

interface MockGame {
  id: string;
  seed: string;
  difficulty: Difficulty;
  status: 'created' | 'started' | 'completed';
  current: RoomId;
  lastSeq: number;
  sent: Set<RoomId>;
  transitions: Map<number, RoomId>;
  startedAt: number | null;
  debugUsed: boolean;
  desync: boolean;
  result: ResultDTO | null;
}

declare global {
  interface Window {
    /** Mock API state (e2e tests). */
    __ogmMock?: { lastSeq(gameId: string): number; desync(gameId: string): boolean };
  }
}

export class MockApi implements GameApi {
  private readonly house = new Map(FIXTURE_ROOMS.map((r) => [r.id, r]));
  private readonly games = new Map<string, MockGame>();
  /** Client errors reported (tests). */
  readonly reported: string[] = [];

  constructor(
    private readonly latencyMs = 0,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Exposes the game state for e2e tests. */
  expose(): void {
    window.__ogmMock = {
      lastSeq: (id) => this.games.get(id)?.lastSeq ?? -1,
      desync: (id) => this.games.get(id)?.desync ?? false,
    };
  }

  async createGame(request: CreateGameRequest): Promise<CreateGameResponse> {
    await this.delay();
    let seed: string;
    let difficulty: Difficulty;
    if (request.mode === 'random') {
      difficulty = request.difficulty;
      seed = SEEDS[difficulty];
    } else {
      const parsed = parseSeed(request.seed);
      if (!parsed.ok) {
        throw parsed.error === 'unsupported_version'
          ? new ApiError(422, 'unsupported_version', 'Unsupported generator version.')
          : new ApiError(400, 'invalid_seed', `Seed code is malformed (${parsed.error}).`);
      }
      seed = parsed.seed.canonical;
      difficulty = parsed.seed.difficulty;
    }
    const id = crypto.randomUUID();
    const sent = this.near(FIXTURE_START);
    this.games.set(id, {
      id,
      seed,
      difficulty,
      status: 'created',
      current: FIXTURE_START,
      lastSeq: 0,
      sent: new Set(sent),
      transitions: new Map(),
      startedAt: null,
      debugUsed: false,
      desync: false,
      result: null,
    });
    const start = this.room(FIXTURE_START);
    return {
      gameId: id,
      seed,
      difficulty,
      generatorVersion: 1,
      startRoom: FIXTURE_START,
      spawn: fixtureSpawn(start),
      rooms: sent.map((r) => this.room(r)),
    };
  }

  async startGame(gameId: string): Promise<StartResponse> {
    await this.delay();
    const g = this.game(gameId);
    if (g.status === 'completed') throw new ApiError(409, 'already_completed', 'Completed.');
    if (g.startedAt === null) {
      g.status = 'started';
      g.startedAt = this.now();
    }
    return { startedAt: new Date(g.startedAt).toISOString() };
  }

  async transition(gameId: string, t: TransitionRequest): Promise<TransitionResponse> {
    await this.delay();
    const g = this.game(gameId);
    if (g.status === 'completed') throw new ApiError(409, 'already_completed', 'Completed.');
    if (g.status !== 'started') throw new ApiError(409, 'not_started', 'Not started.');
    if (t.seq <= g.lastSeq) {
      const to = g.transitions.get(t.seq);
      if (to !== undefined) return { seq: t.seq, current: to, rooms: [] };
    }
    const link = this.house.get(t.from)?.doors.find((d) => d.id === t.door)?.link ?? null;
    if (t.seq !== g.lastSeq + 1 || t.from !== g.current || link === null) {
      g.desync = true;
      throw new ApiError(409, 'desync', 'Transition rejected.', {
        error: { code: 'desync', message: 'Transition rejected.' },
        current: g.current,
        lastSeq: g.lastSeq,
      });
    }
    g.current = link.room;
    g.lastSeq = t.seq;
    g.transitions.set(t.seq, link.room);
    const fresh = this.near(link.room).filter((r) => !g.sent.has(r));
    for (const r of fresh) g.sent.add(r);
    return { seq: t.seq, current: link.room, rooms: fresh.map((r) => this.room(r)) };
  }

  async complete(gameId: string, c: CompleteRequest): Promise<CompleteResponse> {
    await this.delay();
    const g = this.game(gameId);
    if (g.result) return { result: g.result };
    if (g.status !== 'started' || g.startedAt === null) {
      throw new ApiError(409, 'not_started', 'Not started.');
    }
    if (c.lastSeq !== g.lastSeq) throw new ApiError(409, 'pending_transitions', 'Pending.');
    if (g.current !== FIXTURE_GOAL) throw new ApiError(409, 'not_at_goal', 'Not at the goal.');
    const serverElapsed = this.now() - g.startedAt;
    const lag = serverElapsed - c.clientElapsedMs;
    const client = lag >= 0 && lag <= 5000;
    g.status = 'completed';
    g.result = {
      seed: g.seed,
      difficulty: g.difficulty,
      completionMs: client ? c.clientElapsedMs : serverElapsed,
      timeSource: client ? 'client' : 'server',
      completedAt: new Date(this.now()).toISOString(),
      debugUsed: c.debugUsed || g.debugUsed,
    };
    return { result: g.result };
  }

  async rooms(gameId: string, ids: readonly RoomId[]): Promise<RoomDTO[]> {
    await this.delay();
    const g = this.game(gameId);
    const allowed = new Set([...g.sent, ...this.near(g.current)]);
    const denied = ids.filter((r) => !allowed.has(r));
    if (denied.length > 0) throw new ApiError(403, 'room_not_available', denied.join(', '));
    return [...new Set(ids)].sort().map((r) => this.room(r));
  }

  async debug(gameId: string): Promise<DebugResponse> {
    await this.delay();
    const g = this.game(gameId);
    g.debugUsed = true;
    const depth = hopDistances(this.house, FIXTURE_START, 99);
    const path = shortestPath(FIXTURE_ROOMS, FIXTURE_START, FIXTURE_GOAL) ?? [];
    const spine = new Set(path.map((s) => s.room));
    return {
      seed: g.seed,
      difficulty: g.difficulty,
      generatorVersion: 1,
      levelHash: 'fixture',
      start: FIXTURE_START,
      goal: FIXTURE_GOAL,
      current: g.current,
      rooms: FIXTURE_ROOMS.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        depth: depth.get(r.id) ?? 0,
        onSpine: spine.has(r.id),
        twinOf: null,
        doors: r.doors.map((d) => ({ id: d.id, wall: d.wall, link: d.link })),
      })),
      metrics: { rooms: FIXTURE_ROOMS.length },
      pathFromStart: path,
      pathFromCurrent: shortestPath(FIXTURE_ROOMS, g.current, FIXTURE_GOAL) ?? [],
    };
  }

  reportError(message: string): void {
    this.reported.push(message);
  }

  private near(from: RoomId): RoomId[] {
    return [...hopDistances(this.house, from, RADIUS).keys()].sort();
  }

  private room(id: RoomId): RoomDTO {
    const r = this.house.get(id);
    if (!r) throw new ApiError(500, 'internal', `No fixture room ${id}`);
    return r;
  }

  private game(id: string): MockGame {
    const g = this.games.get(id);
    if (!g) throw new ApiError(404, 'game_not_found', 'No such game.');
    return g;
  }

  private delay(): Promise<void> {
    if (this.latencyMs <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      setTimeout(resolve, this.latencyMs);
    });
  }
}
