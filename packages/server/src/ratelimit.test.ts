/**
 * Rate limits (CP07 T4): per IP on game creation and client errors, per game on transitions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DB_AVAILABLE,
  createTestDb,
  errorCode,
  testApp,
  type TestApp,
  type TestDb,
} from './test/harness.js';
import { createGame, startGame } from './test/play.js';

describe.skipIf(!DB_AVAILABLE)('rate limits', () => {
  let db: TestDb;
  let t: TestApp;
  beforeAll(async () => {
    db = await createTestDb();
    t = await testApp(db, { RATE_LIMIT_ENABLED: 'true' });
  });
  afterAll(async () => {
    await t.app.close();
    await db.drop();
  });

  it('client errors: 10 per minute per IP, then 429 rate_limited', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await t.call('POST', '/api/v1/client-errors', { message: 'x' })).status).toBe(204);
    }
    const r = await t.call('POST', '/api/v1/client-errors', { message: 'x' });
    expect([r.status, errorCode(r)]).toEqual([429, 'rate_limited']);
  });

  it('games: 20 per minute per IP', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await t.call('POST', '/api/v1/games', { mode: 'seed', seed: 'E1-7K2Q-X9MP' });
      expect(r.status).toBe(201);
    }
    const r = await t.call('POST', '/api/v1/games', { mode: 'seed', seed: 'E1-7K2Q-X9MP' });
    expect([r.status, errorCode(r)]).toEqual([429, 'rate_limited']);
  });

  it('transitions: 20 per second per game, counted separately for each game', async () => {
    const u = await testApp(db, { RATE_LIMIT_ENABLED: 'true' });
    const a = await createGame(u, { seed: 'E1-7K2Q-X9MP' });
    const b = await createGame(u, { seed: 'E1-7K2Q-X9MP' });
    await startGame(u, a.gameId);
    await startGame(u, b.gameId);
    const send = (id: string) =>
      u.call('POST', `/api/v1/games/${id}/transitions`, {
        seq: 5,
        from: 'r00',
        door: 'd0',
        clientElapsedMs: 1,
      });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await send(a.gameId)).status);
    expect(statuses.slice(0, 20).every((s) => s === 409)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect((await send(b.gameId)).status).toBe(409);
    await u.app.close();
  });
});
