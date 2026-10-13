/**
 * The player journey against the real server (CP08 acceptance; `E2E_API=1`, see
 * playwright.config.ts): streaming with 300 ms latency, the stored result, a network outage
 * and typed-seed reproducibility. Paths come from the debug endpoint.
 */
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import {
  begin,
  crossDoor,
  gameState,
  openGame,
  playToResult,
  roomDto,
  startRandom,
} from './game.js';
import { watchConsole } from './helpers.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://ogm:ogm@localhost:5432/ogm';

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** The debug view's door path from the current room to the goal. */
async function debugPath(page: Page, gameId: string): Promise<string[]> {
  const res = await page.request.get(`/api/v1/games/${gameId}/debug`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    pathFromCurrent: { room: string; exitDoor: string | null }[];
  };
  return body.pathFromCurrent.flatMap((s) => (s.exitDoor === null ? [] : [s.exitDoor]));
}

/** Delays every API request by `ms` (round trip latency). */
async function addLatency(page: Page, ms: number): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test('streaming with 300 ms latency: 20 runs on the real API, no missing portal target, results stored', async ({
  page,
}) => {
  test.setTimeout(1_800_000);
  const console = watchConsole(page);
  await addLatency(page, 300);
  await openGame(page);
  const difficulties = ['Easy', 'Medium', 'Hard'] as const;
  for (let run = 0; run < 20; run++) {
    const difficulty = difficulties[run % 3] ?? 'Easy';
    if (run > 0) await page.getByRole('button', { name: 'New game' }).click();
    await startRandom(page, difficulty);
    await begin(page);
    const { gameId } = await gameState(page);
    if (!gameId) throw new Error('no game');
    await playToResult(page, await debugPath(page, gameId));

    const info = await page.evaluate(() => window.__ogm?.info());
    const log = await page.evaluate(() => window.__ogm?.missingLog() ?? []);
    expect(
      info?.missingPortalTargets,
      `run ${String(run)} (${difficulty}): ${log.join(', ')}`,
    ).toBe(0);

    // The stored result matches the result screen.
    const shown = await page.getByTestId('result-time').textContent();
    const seed = await page.getByTestId('seed-code').textContent();
    const [row] = await query<{
      seed_code: string;
      difficulty: string;
      completion_ms: number;
      debug_used: boolean;
      integrity: string;
    }>(
      'select seed_code, difficulty, completion_ms, debug_used, integrity from results where game_id = $1',
      [gameId],
    );
    expect(row?.seed_code).toBe(seed);
    expect(row?.difficulty).toBe(difficulty.toLowerCase());
    expect(row?.integrity).toBe('ok');
    const ms = row?.completion_ms ?? -1;
    const cs = Math.floor(ms / 10) % 100;
    const s = Math.floor(ms / 1000);
    expect(shown).toBe(
      `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`,
    );
  }
  expect(console).toEqual([]);
});

test('a 10 s outage of /transitions: play continues, the badge comes and goes, nothing is lost', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openGame(page);
  await startRandom(page, 'Medium');
  await begin(page);
  const { gameId } = await gameState(page);
  if (!gameId) throw new Error('no game');
  const doors = await debugPath(page, gameId);

  let blocked = true;
  await page.route('**/api/v1/games/*/transitions', async (route) => {
    if (blocked) await route.abort('failed');
    else await route.continue();
  });
  const outageStart = Date.now();
  // Keep playing: two crossings during the outage.
  for (const door of doors.slice(0, 2)) await crossDoor(page, door);
  await expect(page.getByTestId('reconnecting')).toBeVisible({ timeout: 8000 });
  expect((await gameState(page)).pending).toBe(Math.min(2, doors.length));
  await page.waitForTimeout(Math.max(0, 10_000 - (Date.now() - outageStart)));
  blocked = false;
  await expect(page.getByTestId('reconnecting')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => window.__ogm?.game?.().pending === 0, null, { timeout: 15_000 });

  const client = await gameState(page);
  const [server] = await query<{ last_seq: number; current_room: string; integrity: string }>(
    'select last_seq, current_room, integrity from games where id = $1',
    [gameId],
  );
  expect(server?.last_seq).toBe(client.lastSeq);
  expect(server?.last_seq).toBe(Math.min(2, doors.length));
  expect(server?.integrity).toBe('ok');
  expect(server?.current_room).toBe(await page.evaluate(() => window.__ogm?.getState().room));

  // And the game still completes.
  await playToResult(page, await debugPath(page, gameId));
});

test('a typed seed reproduces the same house (start room and its furniture)', async ({ page }) => {
  await openGame(page);
  await startRandom(page, 'Hard');
  const first = await gameState(page);
  const startRoom = await page.evaluate(() => window.__ogm?.getState().room ?? '');
  const original = await roomDto(page, startRoom);

  await page.goto(`/?seed=${first.seed ?? ''}`);
  await page.getByTestId('start-button').click();
  await page.getByTestId('ready-screen').waitFor();
  const second = await gameState(page);
  expect(second.seed).toBe(first.seed);
  expect(second.gameId).not.toBe(first.gameId);
  expect(await page.evaluate(() => window.__ogm?.getState().room)).toBe(startRoom);
  expect(await roomDto(page, startRoom)).toEqual(original);
});
