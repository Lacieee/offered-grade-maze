/**
 * Integration test harness (CP07): a fresh, migrated PostgreSQL database per test file on
 * the dev server (`pnpm db:up`), and the app driven with `inject`.
 *
 * Without a reachable database the integration suites are skipped with a warning, unless
 * `OGM_REQUIRE_DB=1` (CI), which makes them fail instead.
 */
import { randomBytes } from 'node:crypto';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { buildApp, type App } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { openDatabase, runMigrations, type Database } from '../db/client.js';
import { LevelCache } from '../levels/LevelCache.js';

/** Admin connection (any database on the test server). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://ogm:ogm@localhost:5432/ogm';

/** A throwaway database. */
export interface TestDb extends Database {
  url: string;
  drop(): Promise<void>;
}

async function reachable(): Promise<boolean> {
  const client = new pg.Client({
    connectionString: TEST_DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/** True when integration tests can run; throws in CI (`OGM_REQUIRE_DB=1`) if they cannot. */
export const DB_AVAILABLE: boolean = await (async () => {
  const ok = await reachable();
  if (!ok && process.env.OGM_REQUIRE_DB === '1') {
    throw new Error(`OGM_REQUIRE_DB=1 but ${TEST_DATABASE_URL} is not reachable`);
  }
  if (!ok) {
    console.warn(
      `[server tests] PostgreSQL not reachable at ${TEST_DATABASE_URL}: integration tests skipped (run pnpm db:up).`,
    );
  }
  return ok;
})();

/** Creates and migrates a fresh database. */
export async function createTestDb(): Promise<TestDb> {
  const name = `ogm_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const database = openDatabase(url.toString(), 5);
  await runMigrations(database.db);
  return {
    ...database,
    url: url.toString(),
    async drop() {
      await database.close();
      const a = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}

/** A controllable clock. */
export class TestClock {
  constructor(public ms = Date.parse('2026-11-01T10:00:00.000Z')) {}
  now = (): Date => new Date(this.ms);
  advance(ms: number): void {
    this.ms += ms;
  }
}

export interface TestApp extends App {
  config: Config;
  clock: TestClock;
  /** `inject` returning the parsed JSON body. */
  call(method: InjectOptions['method'], url: string, body?: unknown): Promise<Reply>;
}

/** A response: status and parsed JSON body (check it with a schema). */
export interface Reply {
  status: number;
  body: unknown;
  res: LightMyRequestResponse;
}

/** Parses `reply.body` with `schema` after checking the status. */
export function expectBody<T>(reply: Reply, status: number, schema: { parse(v: unknown): T }): T {
  if (reply.status !== status) {
    throw new Error(`expected ${String(status)}, got ${String(reply.status)}: ${reply.res.body}`);
  }
  return schema.parse(reply.body);
}

/** The error code of an error reply. */
export function errorCode(reply: Reply): string {
  const body = reply.body as { error?: { code?: unknown } } | null;
  return typeof body?.error?.code === 'string' ? body.error.code : `<no error: ${reply.res.body}>`;
}

/** A shared level cache: generation is deterministic, so tests can reuse levels. */
const sharedCache = new LevelCache(200);

/** Builds the app on `db` with test-friendly configuration (no rate limits unless asked). */
export async function testApp(
  db: TestDb,
  env: Record<string, string> = {},
  extra: { random?: () => Uint8Array; cache?: LevelCache } = {},
): Promise<TestApp> {
  const config = loadConfig({
    LOG_LEVEL: 'silent',
    RATE_LIMIT_ENABLED: 'false',
    CLIENT_DIST: '/nonexistent',
    ...env,
  });
  const clock = new TestClock();
  const built = await buildApp({
    config,
    db: db.db,
    cache: extra.cache ?? sharedCache,
    now: clock.now,
    logger: false,
    ...(extra.random ? { random: extra.random } : {}),
  });
  await built.app.ready();
  return {
    ...built,
    config,
    clock,
    async call(method, url, body) {
      const res = await built.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
      });
      const text = res.body;
      return { status: res.statusCode, body: text.length > 0 ? JSON.parse(text) : null, res };
    },
  };
}
