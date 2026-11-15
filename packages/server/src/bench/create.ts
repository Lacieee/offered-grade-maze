/**
 * `POST /games` timing for Hard with a cache miss on every request (CP07 acceptance:
 * p95 < 300 ms on the M1 Max). Needs PostgreSQL (`pnpm db:up`):
 *
 *   pnpm --filter @ogm/server bench:create [count]
 *
 * Exits 1 if p95 is 300 ms or more.
 */
import { performance } from 'node:perf_hooks';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { openDatabase, runMigrations } from '../db/client.js';
import { LevelCache } from '../levels/LevelCache.js';

const count = Number(process.argv[2] ?? 100);
const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent', RATE_LIMIT_ENABLED: 'false' });
const database = openDatabase(config.DATABASE_URL);
await runMigrations(database.db);
// A one-level cache: every random seed is new, so every request is a miss.
const { app } = await buildApp({
  config,
  db: database.db,
  cache: new LevelCache(1),
  logger: false,
});
await app.ready();

const times: number[] = [];
for (let i = 0; i < count; i++) {
  const t0 = performance.now();
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/games',
    payload: { mode: 'random', difficulty: 'hard' },
  });
  times.push(performance.now() - t0);
  if (r.statusCode !== 201) throw new Error(`unexpected ${String(r.statusCode)}: ${r.body}`);
}
await app.close();
await database.close();

const sorted = [...times].sort((a, b) => a - b);
const pct = (p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
const p95 = pct(0.95);
console.log(
  `POST /games hard, cache miss, n=${String(count)}: p50 ${pct(0.5).toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · max ${pct(1).toFixed(1)} ms`,
);
process.exit(p95 < 300 ? 0 : 1);
