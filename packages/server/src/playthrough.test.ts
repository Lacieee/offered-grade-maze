/**
 * Scripted API playthrough (CP07 acceptance): follow `pathFromStart` from the debug view on
 * each difficulty, check the streamed neighbourhood after every transition, complete, and
 * check the stored result.
 */
import { CompleteResponseSchema, type Difficulty, type RoomId } from '@ogm/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { games, gameTransitions, results } from './db/schema.js';
import { neighbourhood } from './levels/neighbourhood.js';
import {
  DB_AVAILABLE,
  createTestDb,
  expectBody,
  testApp,
  type TestApp,
  type TestDb,
} from './test/harness.js';
import { createGame, debugView, startGame, walkToGoal } from './test/play.js';

describe.skipIf(!DB_AVAILABLE)('scripted playthrough (CP07 acceptance)', () => {
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

  it.each(['easy', 'medium', 'hard'] as const)(
    '%s: walks the shortest path to the goal with every room within 4 hops cached',
    async (difficulty: Difficulty) => {
      const g = await createGame(t, { difficulty });
      // The client-side cache: the union of every room the server returned.
      const cache = new Set<RoomId>(g.rooms.map((r) => r.id));
      await startGame(t, g.gameId);
      // The debug view knows the whole graph (it also marks the game debug_used).
      const debug = await debugView(t, g.gameId);
      const graph = { rooms: debug.rooms };
      expect(neighbourhood(graph, g.startRoom, 4).every((r) => cache.has(r))).toBe(true);

      const transitions = await walkToGoal(t, g.gameId, debug, (r) => {
        for (const room of r.rooms) cache.add(room.id);
        const missing = neighbourhood(graph, r.current, 4).filter((x) => !cache.has(x));
        expect(missing, `after seq ${String(r.seq)} in ${r.current}`).toEqual([]);
      });
      expect(transitions).toBe(debug.pathFromStart.length - 1);

      t.clock.advance(transitions * 4000 + 2000);
      const { result } = expectBody(
        await t.call('POST', `/api/v1/games/${g.gameId}/complete`, {
          lastSeq: transitions,
          clientElapsedMs: transitions * 4000,
          debugUsed: false,
        }),
        200,
        CompleteResponseSchema,
      );
      expect(result).toMatchObject({
        seed: g.seed,
        difficulty,
        completionMs: transitions * 4000,
        timeSource: 'client',
        debugUsed: true, // the debug view was opened
      });

      const [row] = await db.db.select().from(results).where(eq(results.gameId, g.gameId));
      expect(row).toMatchObject({
        seedCode: g.seed,
        difficulty,
        generatorVersion: 1,
        completionMs: transitions * 4000,
        timeSource: 'client',
        transitions,
        debugUsed: true,
        integrity: 'ok',
      });
      const [game] = await db.db.select().from(games).where(eq(games.id, g.gameId));
      expect(game).toMatchObject({
        status: 'completed',
        currentRoom: debug.goal,
        lastSeq: transitions,
      });
      const moves = await db.db
        .select()
        .from(gameTransitions)
        .where(eq(gameTransitions.gameId, g.gameId));
      expect(moves.map((m) => m.seq).sort((a, b) => a - b)).toEqual(
        Array.from({ length: transitions }, (_, i) => i + 1),
      );
    },
  );
});
