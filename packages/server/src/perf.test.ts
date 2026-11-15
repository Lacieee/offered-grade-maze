/**
 * `POST /games` p95 under 300 ms for Hard on a cache miss (CP07 acceptance). The full
 * measurement is `pnpm --filter @ogm/server bench:create`; this is a quick guard.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LevelCache } from './levels/LevelCache.js';
import { DB_AVAILABLE, createTestDb, testApp, type TestApp, type TestDb } from './test/harness.js';

describe.skipIf(!DB_AVAILABLE)('game creation time', () => {
  let db: TestDb;
  let t: TestApp;
  beforeAll(async () => {
    db = await createTestDb();
    t = await testApp(db, {}, { cache: new LevelCache(1) });
  });
  afterAll(async () => {
    await t.app.close();
    await db.drop();
  });

  it('Hard, cache miss: p95 < 300 ms over 30 games', async () => {
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      const r = await t.call('POST', '/api/v1/games', { mode: 'random', difficulty: 'hard' });
      times.push(performance.now() - t0);
      expect(r.status).toBe(201);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(times.length * 0.95) - 1]).toBeLessThan(300);
  });
});
