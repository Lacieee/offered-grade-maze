/**
 * Hourly housekeeping (CP07 T7).
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { games, gameTransitions, results } from './db/schema.js';
import { runExpiry } from './jobs/expiry.js';
import { DB_AVAILABLE, createTestDb, type TestDb } from './test/harness.js';

const NOW = new Date('2026-11-01T12:00:00Z');
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);

describe.skipIf(!DB_AVAILABLE)('expiry job (CP07 T7)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.drop();
  });

  async function game(over: Partial<typeof games.$inferInsert>): Promise<string> {
    const id = randomUUID();
    await db.db.insert(games).values({
      id,
      seedCode: 'E1-7K2Q-X9MP',
      difficulty: 'easy',
      generatorVersion: 1,
      levelHash: 'h',
      status: 'created',
      currentRoom: 'r00',
      sentRooms: ['r00'],
      createdAt: ago(1),
      ...over,
    });
    await db.db.insert(gameTransitions).values({
      gameId: id,
      seq: 1,
      fromRoom: 'r00',
      door: 'd0',
      toRoom: 'r01',
      clientElapsedMs: 1,
      serverAt: ago(1),
    });
    return id;
  }
  const status = async (id: string) =>
    (await db.db.select().from(games).where(eq(games.id, id)))[0]?.status ?? 'deleted';
  const moves = async (id: string) =>
    (await db.db.select().from(gameTransitions).where(eq(gameTransitions.gameId, id))).length;

  it('expires stale games, prunes old transitions, deletes abandoned created games', async () => {
    const fresh = await game({ status: 'started', startedAt: ago(23) });
    const stale = await game({ status: 'started', startedAt: ago(25) });
    const oldExpired = await game({ status: 'expired', startedAt: ago(32 * 24) });
    const recentExpired = await game({ status: 'expired', startedAt: ago(10 * 24) });
    const oldDone = await game({
      status: 'completed',
      startedAt: ago(40 * 24),
      completedAt: ago(31 * 24),
    });
    const recentDone = await game({
      status: 'completed',
      startedAt: ago(3 * 24),
      completedAt: ago(2 * 24),
    });
    await db.db.insert(results).values({
      id: randomUUID(),
      gameId: oldDone,
      seedCode: 'E1-7K2Q-X9MP',
      difficulty: 'easy',
      generatorVersion: 1,
      completionMs: 1000,
      timeSource: 'client',
      transitions: 1,
      debugUsed: false,
      integrity: 'ok',
      completedAt: ago(31 * 24),
    });
    // Created games carry no transitions in practice; this one's are removed with it.
    const abandoned = await game({ status: 'created', createdAt: ago(25) });
    await db.db.delete(gameTransitions).where(eq(gameTransitions.gameId, abandoned));
    const newCreated = await game({ status: 'created', createdAt: ago(2) });

    const report = await runExpiry(db.db, NOW);
    expect(report).toEqual({ expired: 1, transitionsDeleted: 2, createdDeleted: 1 });

    expect(await status(fresh)).toBe('started');
    expect(await status(stale)).toBe('expired');
    expect(await status(abandoned)).toBe('deleted');
    expect(await status(newCreated)).toBe('created');
    expect(await moves(oldExpired)).toBe(0);
    expect(await moves(oldDone)).toBe(0);
    expect(await moves(recentExpired)).toBe(1);
    expect(await moves(recentDone)).toBe(1);
    expect(await moves(stale)).toBe(1);
    // Results are kept forever.
    expect(await db.db.select().from(results).where(eq(results.gameId, oldDone))).toHaveLength(1);

    // A second run changes nothing.
    expect(await runExpiry(db.db, NOW)).toEqual({
      expired: 0,
      transitionsDeleted: 0,
      createdDeleted: 0,
    });
  });
});
