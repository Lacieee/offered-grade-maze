/**
 * Game sessions (CP07 T4–T6): creation, start, door transitions, completion, room streaming
 * and the debug view. Every rule the client could cheat on is checked here.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { GenerationError, InvalidSeedError, type Level } from '@ogm/generator';
import {
  formatSeed,
  parseSeed,
  shortestPath,
  type CompleteRequest,
  type CreateGameRequest,
  type CreateGameResponse,
  type DebugResponse,
  type Difficulty,
  type ResultDTO,
  type RoomDTO,
  type RoomId,
  type TransitionRequest,
  type TransitionResponse,
} from '@ogm/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import { games, gameTransitions, results, type GameRow, type ResultRow } from '../db/schema.js';
import { ApiError, gameNotFound } from '../errors.js';
import type { LevelCache } from '../levels/LevelCache.js';
import { neighbourhood } from '../levels/neighbourhood.js';

/** Random seeds drawn before giving up with 503 (each already had 64 attempts). */
export const MAX_RANDOM_SEEDS = 5;
/** Client time is official if it is at most this much below the server's (ms). */
export const CLIENT_TIME_TOLERANCE_MS = 5000;
/** Rooms per `GET /rooms` request. */
export const MAX_ROOM_IDS = 24;

/** What the service needs from its surroundings (injectable for tests). */
export interface GameServiceDeps {
  db: Db;
  cache: LevelCache;
  log: FastifyBaseLogger;
  /** Door hops streamed ahead (`PREFETCH_RADIUS`). */
  radius: number;
  now?: () => Date;
  /** Five random bytes for a seed payload. */
  random?: () => Uint8Array;
}

/** Transaction handle (same query API as the database). */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const notStarted = (): ApiError =>
  new ApiError(409, 'not_started', 'The game has not been started.');
const alreadyCompleted = (): ApiError =>
  new ApiError(409, 'already_completed', 'The game is already completed.');
const expired = (): ApiError => new ApiError(409, 'game_expired', 'The game has expired.');

export class GameService {
  private readonly now: () => Date;
  private readonly random: () => Uint8Array;

  constructor(private readonly deps: GameServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random ?? (() => randomBytes(5));
  }

  // ---------------------------------------------------------------- POST /games

  /** Creates a game from a random or typed seed. */
  async create(request: CreateGameRequest): Promise<CreateGameResponse> {
    const { level, attempts, generationMs } =
      request.mode === 'random'
        ? this.randomLevel(request.difficulty)
        : this.typedLevel(request.seed);
    const sent = neighbourhood(level, level.startRoom, this.deps.radius);
    const id = randomUUID();
    await this.deps.db.insert(games).values({
      id,
      seedCode: level.seed,
      difficulty: level.difficulty,
      generatorVersion: level.generatorVersion,
      levelHash: level.meta.levelHash,
      status: 'created',
      currentRoom: level.startRoom,
      sentRooms: sent,
      createdAt: this.now(),
    });
    this.deps.log.info(
      {
        event: 'game.created',
        gameId: id,
        seed: level.seed,
        difficulty: level.difficulty,
        attempts,
        generationMs: Math.round(generationMs),
      },
      'game.created',
    );
    return {
      gameId: id,
      seed: level.seed,
      difficulty: level.difficulty,
      generatorVersion: level.generatorVersion,
      startRoom: level.startRoom,
      spawn: level.spawn,
      rooms: roomsById(level, sent),
    };
  }

  private randomLevel(difficulty: Difficulty): {
    level: Level;
    attempts: number;
    generationMs: number;
  } {
    for (let draw = 1; draw <= MAX_RANDOM_SEEDS; draw++) {
      const seed = formatSeed(difficulty, 1, this.random());
      try {
        const { level, generationMs } = this.deps.cache.get(seed);
        return { level, attempts: level.meta.attempts, generationMs };
      } catch (err) {
        // The player never sees this: draw another seed (logged for later analysis).
        this.deps.log.error(
          { event: 'game.generation_failed', seed, mode: 'random', err: errorText(err) },
          'game.generation_failed',
        );
      }
    }
    throw new ApiError(503, 'generation_unavailable', 'Could not create a game. Try again.');
  }

  private typedLevel(input: string): { level: Level; attempts: number; generationMs: number } {
    const parsed = parseSeed(input);
    if (!parsed.ok) {
      if (parsed.error === 'unsupported_version') {
        throw new ApiError(
          422,
          'unsupported_version',
          'This seed was made by a generator version this server does not support.',
        );
      }
      throw new ApiError(400, 'invalid_seed', `Seed code is malformed (${parsed.error}).`);
    }
    const seed = parsed.seed.canonical;
    try {
      const { level, generationMs } = this.deps.cache.get(seed);
      return { level, attempts: level.meta.attempts, generationMs };
    } catch (err) {
      if (err instanceof InvalidSeedError) {
        throw new ApiError(400, 'invalid_seed', 'Seed code is malformed.');
      }
      this.deps.log.error(
        { event: 'game.generation_failed', seed, mode: 'seed', err: errorText(err) },
        'game.generation_failed',
      );
      if (err instanceof GenerationError) {
        throw new ApiError(
          422,
          'seed_not_playable',
          'This seed does not produce a playable house.',
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------- POST /games/:id/start

  /** Starts the clock (idempotent: returns the stored start time). */
  async start(id: string): Promise<{ startedAt: string }> {
    const game = await this.find(this.deps.db, id);
    if (game.status === 'completed') throw alreadyCompleted();
    if (game.status === 'expired') throw expired();
    if (game.status === 'started' && game.startedAt) return { startedAt: iso(game.startedAt) };
    const startedAt = this.now();
    const [row] = await this.deps.db
      .update(games)
      .set({ status: 'started', startedAt })
      .where(and(eq(games.id, id), eq(games.status, 'created')))
      .returning();
    if (row?.startedAt) return { startedAt: iso(row.startedAt) };
    // Lost a race with a concurrent /start: return what it stored.
    return this.start(id);
  }

  // ---------------------------------------------------------------- POST /games/:id/transitions

  /** Validates and applies one door crossing (T5). */
  async transition(id: string, t: TransitionRequest): Promise<TransitionResponse> {
    const outcome = await this.deps.db.transaction(async (tx) => {
      const game = await this.find(tx, id, true);
      if (game.status === 'completed') throw alreadyCompleted();
      if (game.status === 'expired') throw expired();
      if (game.status !== 'started') throw notStarted();

      // Idempotent replay of an already applied transition.
      if (t.seq <= game.lastSeq) {
        const [stored] = await tx
          .select()
          .from(gameTransitions)
          .where(and(eq(gameTransitions.gameId, id), eq(gameTransitions.seq, t.seq)));
        if (stored) {
          return { ok: true as const, body: { seq: t.seq, current: stored.toRoom, rooms: [] } };
        }
      }

      const level = this.levelOf(game);
      const door = level.rooms.find((r) => r.id === t.from)?.doors.find((d) => d.id === t.door);
      const reason =
        t.seq !== game.lastSeq + 1
          ? `seq ${String(t.seq)} after ${String(game.lastSeq)}`
          : t.from !== game.currentRoom
            ? `from ${t.from} but current is ${game.currentRoom}`
            : door === undefined
              ? `no door ${t.door} in ${t.from}`
              : door.link === null
                ? `door ${t.from}.${t.door} is sealed`
                : null;
      if (reason !== null || !door?.link) {
        await tx.update(games).set({ integrity: 'desync' }).where(eq(games.id, id));
        return {
          ok: false as const,
          reason: reason ?? 'invalid door',
          current: game.currentRoom,
          lastSeq: game.lastSeq,
        };
      }

      const to = door.link.room;
      const sent = new Set(game.sentRooms);
      const fresh = neighbourhood(level, to, this.deps.radius).filter((r) => !sent.has(r));
      await tx
        .update(games)
        .set({ currentRoom: to, lastSeq: t.seq, sentRooms: [...game.sentRooms, ...fresh] })
        .where(eq(games.id, id));
      await tx.insert(gameTransitions).values({
        gameId: id,
        seq: t.seq,
        fromRoom: t.from,
        door: t.door,
        toRoom: to,
        clientElapsedMs: t.clientElapsedMs,
        serverAt: this.now(),
      });
      return {
        ok: true as const,
        body: { seq: t.seq, current: to, rooms: roomsById(level, fresh) },
      };
    });

    if (outcome.ok) return outcome.body;
    this.deps.log.warn(
      {
        event: 'game.desync',
        gameId: id,
        reason: outcome.reason,
        request: t,
        current: outcome.current,
        lastSeq: outcome.lastSeq,
      },
      'game.desync',
    );
    throw new ApiError(409, 'desync', `Transition rejected: ${outcome.reason}.`, {
      current: outcome.current,
      lastSeq: outcome.lastSeq,
    });
  }

  // ---------------------------------------------------------------- POST /games/:id/complete

  /** Settles the official time and stores the result (T6, idempotent). */
  async complete(id: string, c: CompleteRequest): Promise<{ result: ResultDTO }> {
    const row = await this.deps.db.transaction(async (tx) => {
      const game = await this.find(tx, id, true);
      if (game.status === 'completed') {
        const [stored] = await tx.select().from(results).where(eq(results.gameId, id));
        if (stored) return stored;
      }
      if (game.status === 'expired') throw expired();
      if (game.status !== 'started' || !game.startedAt) throw notStarted();
      if (c.lastSeq !== game.lastSeq) {
        throw new ApiError(
          409,
          'pending_transitions',
          `The server has transitions up to ${String(game.lastSeq)}, the client ${String(c.lastSeq)}.`,
        );
      }
      const level = this.levelOf(game);
      if (game.currentRoom !== level.goalRoom) {
        throw new ApiError(409, 'not_at_goal', 'The player is not in the goal room.');
      }

      const completedAt = this.now();
      const serverElapsed = completedAt.getTime() - game.startedAt.getTime();
      const lag = serverElapsed - c.clientElapsedMs;
      const client = lag >= 0 && lag <= CLIENT_TIME_TOLERANCE_MS;
      const result: ResultRow = {
        id: randomUUID(),
        gameId: id,
        seedCode: game.seedCode,
        difficulty: game.difficulty,
        generatorVersion: game.generatorVersion,
        completionMs: client ? c.clientElapsedMs : Math.max(0, serverElapsed),
        timeSource: client ? 'client' : 'server',
        transitions: game.lastSeq,
        debugUsed: c.debugUsed || game.debugUsed,
        integrity: game.integrity,
        completedAt,
      };
      await tx.update(games).set({ status: 'completed', completedAt }).where(eq(games.id, id));
      await tx.insert(results).values(result);
      this.deps.log.info(
        {
          event: 'game.completed',
          gameId: id,
          seed: game.seedCode,
          completionMs: result.completionMs,
          timeSource: result.timeSource,
          serverElapsedMs: serverElapsed,
          transitions: result.transitions,
          debugUsed: result.debugUsed,
          integrity: result.integrity,
        },
        'game.completed',
      );
      return result;
    });
    return { result: resultDto(row) };
  }

  // ---------------------------------------------------------------- GET /games/:id/rooms

  /** Rooms the client may have: already sent, or within reach of the current room. */
  async rooms(id: string, ids: readonly RoomId[]): Promise<{ rooms: RoomDTO[] }> {
    const game = await this.find(this.deps.db, id);
    const level = this.levelOf(game);
    const allowed = new Set([
      ...game.sentRooms,
      ...neighbourhood(level, game.currentRoom, this.deps.radius),
    ]);
    const denied = ids.filter((r) => !allowed.has(r));
    if (denied.length > 0) {
      throw new ApiError(403, 'room_not_available', `Rooms not available: ${denied.join(', ')}.`);
    }
    return { rooms: roomsById(level, [...new Set(ids)]) };
  }

  // ---------------------------------------------------------------- GET /games/:id/debug

  /** The whole house with depths, spine and paths; marks the game `debug_used` (PD8). */
  async debug(id: string): Promise<DebugResponse> {
    const [game] = await this.deps.db
      .update(games)
      .set({ debugUsed: true })
      .where(eq(games.id, id))
      .returning();
    if (!game) throw gameNotFound();
    const level = this.levelOf(game);
    const { meta } = level;
    const spine = new Set(meta.spine);
    return {
      seed: level.seed,
      difficulty: level.difficulty,
      generatorVersion: level.generatorVersion,
      levelHash: meta.levelHash,
      start: level.startRoom,
      goal: level.goalRoom,
      current: game.currentRoom,
      rooms: level.rooms.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        depth: meta.depth[r.id] ?? 0,
        onSpine: spine.has(r.id),
        twinOf: meta.twinOf[r.id] ?? null,
        doors: r.doors.map((d) => ({ id: d.id, wall: d.wall, link: d.link })),
      })),
      metrics: { ...meta.metrics },
      pathFromStart: shortestPath(level.rooms, level.startRoom, level.goalRoom) ?? [],
      pathFromCurrent: shortestPath(level.rooms, game.currentRoom, level.goalRoom) ?? [],
    };
  }

  // ---------------------------------------------------------------- helpers

  private async find(db: Db | Tx, id: string, forUpdate = false): Promise<GameRow> {
    const query = db.select().from(games).where(eq(games.id, id));
    const [game] = forUpdate ? await query.for('update') : await query;
    if (!game) throw gameNotFound();
    return game;
  }

  /**
   * The level of a stored game. A regenerated level must hash exactly as when the game was
   * created; otherwise the generator drifted and the game cannot continue (T3).
   */
  private levelOf(game: GameRow): Level {
    const { level } = this.deps.cache.get(game.seedCode);
    if (level.meta.levelHash !== game.levelHash) {
      this.deps.log.error(
        {
          event: 'game.level_drift',
          gameId: game.id,
          seed: game.seedCode,
          stored: game.levelHash,
          generated: level.meta.levelHash,
        },
        'game.level_drift',
      );
      throw new ApiError(500, 'level_drift', 'This game can no longer be served.');
    }
    return level;
  }
}

/** The rooms of `level` with the given ids, sorted by id. */
function roomsById(level: Level, ids: readonly RoomId[]): RoomDTO[] {
  const wanted = new Set(ids);
  return level.rooms.filter((r) => wanted.has(r.id));
}

function resultDto(row: ResultRow): ResultDTO {
  return {
    seed: row.seedCode,
    difficulty: row.difficulty as Difficulty,
    completionMs: row.completionMs,
    timeSource: row.timeSource,
    completedAt: iso(row.completedAt),
    debugUsed: row.debugUsed,
  };
}

const iso = (d: Date): string => d.toISOString();

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
