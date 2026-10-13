/**
 * Integration tests for every `/api/v1` endpoint (CP07 acceptance): happy paths, error
 * codes, idempotency, desync flagging, timing branches, the `/rooms` rule and debug.
 */
import { GenerationError, generateLevel, validateLevel } from '@ogm/generator';
import {
  CompleteResponseSchema,
  DesyncErrorSchema,
  HealthResponseSchema,
  RoomsResponseSchema,
  shortestPath,
} from '@ogm/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from './db/client.js';
import { games, gameTransitions, results } from './db/schema.js';
import { LevelCache } from './levels/LevelCache.js';
import { neighbourhood } from './levels/neighbourhood.js';
import {
  DB_AVAILABLE,
  createTestDb,
  errorCode,
  expectBody,
  testApp,
  type TestApp,
  type TestDb,
} from './test/harness.js';
import { createGame, cross, debugView, startGame } from './test/play.js';

const MEDIUM = 'M1-7K2Q-X9MP';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!DB_AVAILABLE)('API (CP07 T4–T6)', () => {
  let db: TestDb;
  let t: TestApp;

  beforeAll(async () => {
    db = await createTestDb();
    t = await testApp(db);
  });
  afterAll(async () => {
    await t.app.close();
    await db.drop();
  });

  const gameRow = async (id: string) => {
    const [row] = await db.db.select().from(games).where(eq(games.id, id));
    if (!row) throw new Error(`no game ${id}`);
    return row;
  };

  // ---------------------------------------------------------------- POST /games

  describe('POST /games', () => {
    it.each(['easy', 'medium', 'hard'] as const)(
      'random %s: 201 with the start neighbourhood, stored as created',
      async (difficulty) => {
        const g = await createGame(t, { difficulty });
        expect(g.difficulty).toBe(difficulty);
        expect(g.seed[0]).toBe(difficulty[0]?.toUpperCase());
        expect(g.generatorVersion).toBe(1);
        const level = generateLevel(g.seed);
        expect(g.rooms.map((r) => r.id)).toEqual(neighbourhood(level, level.startRoom, 4));
        expect(g.startRoom).toBe(level.startRoom);
        expect(g.spawn).toEqual(level.spawn);
        const row = await gameRow(g.gameId);
        expect(row).toMatchObject({
          seedCode: g.seed,
          status: 'created',
          currentRoom: level.startRoom,
          lastSeq: 0,
          levelHash: level.meta.levelHash,
          debugUsed: false,
          integrity: 'ok',
          startedAt: null,
        });
        expect(row.sentRooms).toEqual(g.rooms.map((r) => r.id));
      },
    );

    it('typed seeds are canonicalised and reproducible (same rooms, same level hash)', async () => {
      const a = await createGame(t, { seed: MEDIUM });
      const b = await createGame(t, { seed: ' m1 7k2q x9mp ' });
      expect(b.seed).toBe(MEDIUM);
      expect(b.rooms).toEqual(a.rooms);
      expect(b.gameId).not.toBe(a.gameId);
      expect((await gameRow(b.gameId)).levelHash).toBe((await gameRow(a.gameId)).levelHash);
    });

    it('400 invalid_seed for malformed seeds, 422 unsupported_version, 400 invalid_request', async () => {
      for (const seed of ['', 'nonsense', 'M1-7K2Q-X9M', 'Q1-7K2Q-X9MP', 'M1-7K2Q-X9MU']) {
        const r = await t.call('POST', '/api/v1/games', { mode: 'seed', seed });
        expect([r.status, errorCode(r)], seed).toEqual([400, 'invalid_seed']);
      }
      const v = await t.call('POST', '/api/v1/games', { mode: 'seed', seed: 'M2-7K2Q-X9MP' });
      expect([v.status, errorCode(v)]).toEqual([422, 'unsupported_version']);
      for (const body of [{}, { mode: 'random' }, { mode: 'random', difficulty: 'insane' }]) {
        const r = await t.call('POST', '/api/v1/games', body);
        expect([r.status, errorCode(r)]).toEqual([400, 'invalid_request']);
      }
    });

    it('422 seed_not_playable when a typed seed cannot be generated', async () => {
      const failing = new LevelCache(10, (seed) => {
        throw new GenerationError(seed, ['V1: test']);
      });
      const u = await testApp(db, {}, { cache: failing });
      const r = await u.call('POST', '/api/v1/games', { mode: 'seed', seed: MEDIUM });
      expect([r.status, errorCode(r)]).toEqual([422, 'seed_not_playable']);
      await u.app.close();
    });

    it('random: draws a new seed when generation fails, 503 after five failures', async () => {
      let calls = 0;
      const flaky = new LevelCache(10, (seed) => {
        calls++;
        if (calls <= 2) throw new GenerationError(seed, ['V1: test']);
        return generateLevel(seed);
      });
      let byte = 0;
      const random = (): Uint8Array => new Uint8Array([byte++, 1, 2, 3, 4]);
      const u = await testApp(db, {}, { cache: flaky, random });
      const ok = await u.call('POST', '/api/v1/games', { mode: 'random', difficulty: 'easy' });
      expect(ok.status).toBe(201);
      expect(calls).toBe(3);
      await u.app.close();

      const broken = new LevelCache(10, (seed) => {
        throw new GenerationError(seed, ['V1: test']);
      });
      const w = await testApp(db, {}, { cache: broken, random });
      const r = await w.call('POST', '/api/v1/games', { mode: 'random', difficulty: 'easy' });
      expect([r.status, errorCode(r)]).toEqual([503, 'generation_unavailable']);
      await w.app.close();
    });
  });

  // ---------------------------------------------------------------- POST /games/:id/start

  describe('POST /games/:id/start', () => {
    it('starts once; repeated calls return the stored start time', async () => {
      const g = await createGame(t, { seed: MEDIUM });
      const first = await startGame(t, g.gameId);
      expect(first).toBe(t.clock.now().toISOString());
      t.clock.advance(5000);
      expect(await startGame(t, g.gameId)).toBe(first);
      const row = await gameRow(g.gameId);
      expect(row.status).toBe('started');
      expect(row.startedAt?.toISOString()).toBe(first);
    });

    it('404 unknown game, 400 malformed id', async () => {
      const r = await t.call('POST', `/api/v1/games/${UNKNOWN}/start`);
      expect([r.status, errorCode(r)]).toEqual([404, 'game_not_found']);
      const m = await t.call('POST', '/api/v1/games/not-a-uuid/start');
      expect([m.status, errorCode(m)]).toEqual([400, 'invalid_request']);
    });
  });

  // ---------------------------------------------------------------- transitions

  describe('POST /games/:id/transitions', () => {
    it('409 not_started before /start; 404 for an unknown game', async () => {
      const g = await createGame(t, { seed: MEDIUM });
      const body = { seq: 1, from: g.startRoom, door: 'd0', clientElapsedMs: 10 };
      const r = await t.call('POST', `/api/v1/games/${g.gameId}/transitions`, body);
      expect([r.status, errorCode(r)]).toEqual([409, 'not_started']);
      const u = await t.call('POST', `/api/v1/games/${UNKNOWN}/transitions`, body);
      expect([u.status, errorCode(u)]).toEqual([404, 'game_not_found']);
    });

    it('accepts a valid crossing, streams new rooms, stores it; a replay returns the stored outcome', async () => {
      const g = await createGame(t, { seed: MEDIUM });
      await startGame(t, g.gameId);
      const level = generateLevel(MEDIUM);
      const start = level.rooms.find((r) => r.id === level.startRoom);
      const door = start?.doors.find((d) => d.link !== null);
      if (!door?.link) throw new Error('start room has no linked door');

      const r = await cross(t, g.gameId, 1, level.startRoom, door.id, 1234);
      expect(r.current).toBe(door.link.room);
      const sentBefore = new Set(g.rooms.map((x) => x.id));
      const expected = neighbourhood(level, door.link.room, 4).filter((x) => !sentBefore.has(x));
      expect(r.rooms.map((x) => x.id)).toEqual(expected);

      const row = await gameRow(g.gameId);
      expect(row).toMatchObject({ currentRoom: door.link.room, lastSeq: 1, integrity: 'ok' });
      expect(new Set(row.sentRooms)).toEqual(new Set([...sentBefore, ...expected]));
      const [stored] = await db.db
        .select()
        .from(gameTransitions)
        .where(eq(gameTransitions.gameId, g.gameId));
      expect(stored).toMatchObject({
        seq: 1,
        fromRoom: level.startRoom,
        door: door.id,
        toRoom: door.link.room,
        clientElapsedMs: 1234,
      });

      // Replay (a retry after a lost response): same outcome, no rooms, nothing changes.
      const replay = await cross(t, g.gameId, 1, level.startRoom, door.id, 1234);
      expect(replay).toEqual({ seq: 1, current: door.link.room, rooms: [] });
      expect((await gameRow(g.gameId)).lastSeq).toBe(1);
      expect((await gameRow(g.gameId)).integrity).toBe('ok');
    });

    it('flags desync (409 with current and lastSeq) and keeps the game playable', async () => {
      const g = await createGame(t, { seed: MEDIUM });
      await startGame(t, g.gameId);
      const level = generateLevel(MEDIUM);
      const start = level.rooms.find((r) => r.id === level.startRoom);
      const linked = start?.doors.find((d) => d.link !== null);
      if (!linked?.link) throw new Error('no linked door');
      const url = `/api/v1/games/${g.gameId}/transitions`;
      const other = level.rooms.find((r) => r.id !== level.startRoom)?.id ?? 'r99';
      const bad = [
        { seq: 2, from: level.startRoom, door: linked.id, clientElapsedMs: 1 }, // skipped seq
        { seq: 1, from: other, door: 'd0', clientElapsedMs: 1 }, // wrong room
        { seq: 1, from: level.startRoom, door: 'd9', clientElapsedMs: 1 }, // no such door
      ];
      for (const body of bad) {
        const r = await t.call('POST', url, body);
        expect(r.status).toBe(409);
        expect(DesyncErrorSchema.parse(r.body)).toMatchObject({
          error: { code: 'desync' },
          current: level.startRoom,
          lastSeq: 0,
        });
      }
      expect((await gameRow(g.gameId)).integrity).toBe('desync');
      // Still playable.
      const ok = await cross(t, g.gameId, 1, level.startRoom, linked.id);
      expect(ok.current).toBe(linked.link.room);
    });

    it('a sealed door is a desync', async () => {
      // H1-7K2Q-X9MP: the start room's d0 is sealed.
      const seed = 'H1-7K2Q-X9MP';
      const level = generateLevel(seed);
      const start = level.rooms.find((r) => r.id === level.startRoom);
      expect(start?.doors.find((d) => d.id === 'd0')?.link).toBeNull();
      const g = await createGame(t, { seed });
      await startGame(t, g.gameId);
      const r = await t.call('POST', `/api/v1/games/${g.gameId}/transitions`, {
        seq: 1,
        from: level.startRoom,
        door: 'd0',
        clientElapsedMs: 5,
      });
      expect([r.status, errorCode(r)]).toEqual([409, 'desync']);
    });

    it('400 for a malformed body', async () => {
      const g = await createGame(t, { seed: MEDIUM });
      const r = await t.call('POST', `/api/v1/games/${g.gameId}/transitions`, { seq: 0 });
      expect([r.status, errorCode(r)]).toEqual([400, 'invalid_request']);
    });
  });

  // ---------------------------------------------------------------- complete

  describe('POST /games/:id/complete', () => {
    async function playToGoal(seed = MEDIUM): Promise<{ id: string; transitions: number }> {
      const g = await createGame(t, { seed });
      await startGame(t, g.gameId);
      const level = generateLevel(seed);
      const path = shortestPath(level.rooms, level.startRoom, level.goalRoom) ?? [];
      let seq = 0;
      for (const step of path) {
        if (step.exitDoor === null) break;
        seq++;
        await cross(t, g.gameId, seq, step.room, step.exitDoor);
      }
      return { id: g.gameId, transitions: seq };
    }

    it('409 not_started, not_at_goal and pending_transitions', async () => {
      const g = await createGame(t, { seed: MEDIUM });
      const url = `/api/v1/games/${g.gameId}/complete`;
      const body = { lastSeq: 0, clientElapsedMs: 1000, debugUsed: false };
      const a = await t.call('POST', url, body);
      expect([a.status, errorCode(a)]).toEqual([409, 'not_started']);
      await startGame(t, g.gameId);
      const b = await t.call('POST', url, body);
      expect([b.status, errorCode(b)]).toEqual([409, 'not_at_goal']);
      const c = await t.call('POST', url, { ...body, lastSeq: 3 });
      expect([c.status, errorCode(c)]).toEqual([409, 'pending_transitions']);
    });

    it('client time within 0–5 s of the server time is official (timeSource client)', async () => {
      const { id, transitions } = await playToGoal();
      t.clock.advance(60_000);
      const r = await t.call('POST', `/api/v1/games/${id}/complete`, {
        lastSeq: transitions,
        clientElapsedMs: 57_500,
        debugUsed: false,
      });
      const { result } = expectBody(r, 200, CompleteResponseSchema);
      expect(result).toMatchObject({
        seed: MEDIUM,
        difficulty: 'medium',
        completionMs: 57_500,
        timeSource: 'client',
        debugUsed: false,
      });
      const [row] = await db.db.select().from(results).where(eq(results.gameId, id));
      expect(row).toMatchObject({
        completionMs: 57_500,
        timeSource: 'client',
        transitions,
        integrity: 'ok',
        generatorVersion: 1,
      });
      expect((await gameRow(id)).status).toBe('completed');
    });

    it.each([
      ['claims to be faster than the server allows', 50_000],
      ['claims more time than the server measured', 61_000],
    ])('the server time is official when the client %s', async (_name, clientElapsedMs) => {
      const { id, transitions } = await playToGoal();
      t.clock.advance(60_000);
      const r = await t.call('POST', `/api/v1/games/${id}/complete`, {
        lastSeq: transitions,
        clientElapsedMs,
        debugUsed: false,
      });
      const { result } = expectBody(r, 200, CompleteResponseSchema);
      expect(result).toMatchObject({ completionMs: 60_000, timeSource: 'server' });
    });

    it('is idempotent and later calls cannot change the result; start then answers 409', async () => {
      const { id, transitions } = await playToGoal();
      t.clock.advance(30_000);
      const url = `/api/v1/games/${id}/complete`;
      const first = expectBody(
        await t.call('POST', url, {
          lastSeq: transitions,
          clientElapsedMs: 29_000,
          debugUsed: false,
        }),
        200,
        CompleteResponseSchema,
      );
      t.clock.advance(10_000);
      const again = expectBody(
        await t.call('POST', url, { lastSeq: 0, clientElapsedMs: 1, debugUsed: true }),
        200,
        CompleteResponseSchema,
      );
      expect(again).toEqual(first);
      const rows = await db.db.select().from(results).where(eq(results.gameId, id));
      expect(rows).toHaveLength(1);
      const s = await t.call('POST', `/api/v1/games/${id}/start`);
      expect([s.status, errorCode(s)]).toEqual([409, 'already_completed']);
      const tr = await t.call('POST', `/api/v1/games/${id}/transitions`, {
        seq: transitions + 1,
        from: 'r00',
        door: 'd0',
        clientElapsedMs: 1,
      });
      expect([tr.status, errorCode(tr)]).toEqual([409, 'already_completed']);
    });

    it('debugUsed is true if the client says so or the debug view was opened', async () => {
      const a = await playToGoal();
      const ra = expectBody(
        await t.call('POST', `/api/v1/games/${a.id}/complete`, {
          lastSeq: a.transitions,
          clientElapsedMs: 0,
          debugUsed: true,
        }),
        200,
        CompleteResponseSchema,
      );
      expect(ra.result.debugUsed).toBe(true);

      const b = await playToGoal();
      await debugView(t, b.id);
      const rb = expectBody(
        await t.call('POST', `/api/v1/games/${b.id}/complete`, {
          lastSeq: b.transitions,
          clientElapsedMs: 0,
          debugUsed: false,
        }),
        200,
        CompleteResponseSchema,
      );
      expect(rb.result.debugUsed).toBe(true);
    });
  });

  // ---------------------------------------------------------------- rooms

  describe('GET /games/:id/rooms', () => {
    it('serves sent rooms and rooms within reach; 403 for anything else', async () => {
      const level = generateLevel(MEDIUM);
      const g = await createGame(t, { seed: MEDIUM });
      const sent = g.rooms.map((r) => r.id);
      const ok = expectBody(
        await t.call('GET', `/api/v1/games/${g.gameId}/rooms?ids=${sent.slice(0, 2).join(',')}`),
        200,
        RoomsResponseSchema,
      );
      expect(ok.rooms).toEqual(g.rooms.slice(0, 2));
      const far = level.rooms.map((r) => r.id).find((id) => !sent.includes(id));
      if (far === undefined) throw new Error('every room is near the start');
      const denied = await t.call(
        'GET',
        `/api/v1/games/${g.gameId}/rooms?ids=${sent[0] ?? ''},${far}`,
      );
      expect([denied.status, errorCode(denied)]).toEqual([403, 'room_not_available']);
    });

    it('400 for malformed or too many ids; 404 for an unknown game', async () => {
      const g = await createGame(t, { seed: MEDIUM });
      const base = `/api/v1/games/${g.gameId}/rooms`;
      for (const q of ['', '?ids=', '?ids=kitchen', `?ids=${Array(25).fill('r01').join(',')}`]) {
        const r = await t.call('GET', `${base}${q}`);
        expect([r.status, errorCode(r)], q).toEqual([400, 'invalid_request']);
      }
      const u = await t.call('GET', `/api/v1/games/${UNKNOWN}/rooms?ids=r00`);
      expect([u.status, errorCode(u)]).toEqual([404, 'game_not_found']);
    });
  });

  // ---------------------------------------------------------------- debug

  describe('GET /games/:id/debug', () => {
    it('returns the whole house with depths and paths, and marks the game', async () => {
      const level = generateLevel(MEDIUM);
      const g = await createGame(t, { seed: MEDIUM });
      const d = await debugView(t, g.gameId);
      expect(d).toMatchObject({
        seed: MEDIUM,
        levelHash: level.meta.levelHash,
        start: level.startRoom,
        goal: level.goalRoom,
        current: level.startRoom,
      });
      expect(d.rooms).toHaveLength(level.rooms.length);
      expect(
        d.rooms
          .filter((r) => r.onSpine)
          .map((r) => r.id)
          .sort(),
      ).toEqual([...level.meta.spine].sort());
      expect(d.pathFromStart).toHaveLength(level.meta.metrics.shortest + 1);
      expect(d.pathFromCurrent).toEqual(d.pathFromStart);
      expect(d.metrics.shortest).toBe(level.meta.metrics.shortest);
      expect((await gameRow(g.gameId)).debugUsed).toBe(true);
      const u = await t.call('GET', `/api/v1/games/${UNKNOWN}/debug`);
      expect([u.status, errorCode(u)]).toEqual([404, 'game_not_found']);
    });

    it('404 when the debug view is disabled', async () => {
      const u = await testApp(db, { DEBUG_VIEW_ENABLED: 'false' });
      const g = await createGame(u, { seed: MEDIUM });
      const r = await u.call('GET', `/api/v1/games/${g.gameId}/debug`);
      expect([r.status, errorCode(r)]).toEqual([404, 'not_found']);
      expect((await gameRow(g.gameId)).debugUsed).toBe(false);
      await u.app.close();
    });
  });

  // ---------------------------------------------------------------- misc

  describe('client errors, health, unknown routes', () => {
    it('POST /client-errors: 204; 400 invalid; 413 over 8 kB', async () => {
      const ok = await t.call('POST', '/api/v1/client-errors', {
        message: 'boom',
        stack: 'at x',
        context: { room: 'r01' },
      });
      expect(ok.status).toBe(204);
      const bad = await t.call('POST', '/api/v1/client-errors', { stack: 'x' });
      expect([bad.status, errorCode(bad)]).toEqual([400, 'invalid_request']);
      const big = await t.call('POST', '/api/v1/client-errors', {
        message: 'x',
        context: { blob: 'y'.repeat(9000) },
      });
      expect([big.status, errorCode(big)]).toEqual([413, 'payload_too_large']);
    });

    it('GET /health reports the database', async () => {
      const ok = expectBody(await t.call('GET', '/api/v1/health'), 200, HealthResponseSchema);
      expect(ok.db).toBe('ok');
      const dead = openDatabase('postgres://ogm:ogm@localhost:1/none', 1);
      const { buildApp } = await import('./app.js');
      const { loadConfig } = await import('./config.js');
      const { app } = await buildApp({
        config: loadConfig({ LOG_LEVEL: 'silent', CLIENT_DIST: '/nonexistent' }),
        db: dead.db,
        logger: false,
      });
      const r = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(HealthResponseSchema.parse(r.json())).toMatchObject({ status: 'ok', db: 'down' });
      await app.close();
      await dead.close();
    });

    it('unknown API routes answer 404 in the error format', async () => {
      for (const [method, url] of [
        ['GET', '/api/v1/nope'],
        ['POST', '/api/v1/games/x/y/z'],
        ['GET', '/anything'],
      ] as const) {
        const r = await t.call(method, url);
        expect([r.status, errorCode(r)], url).toEqual([404, 'not_found']);
      }
    });
  });

  // ---------------------------------------------------------------- level drift

  it('a stored level hash that no longer matches answers 500 level_drift', async () => {
    const g = await createGame(t, { seed: MEDIUM });
    await db.db.update(games).set({ levelHash: 'stale' }).where(eq(games.id, g.gameId));
    const r = await t.call('GET', `/api/v1/games/${g.gameId}/rooms?ids=${g.startRoom}`);
    expect([r.status, errorCode(r)]).toEqual([500, 'level_drift']);
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts/);
  });

  it('every served level passed the validator', () => {
    expect(validateLevel(generateLevel(MEDIUM))).toEqual([]);
  });
});
