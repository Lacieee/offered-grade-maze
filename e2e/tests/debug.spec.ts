/**
 * The debug view (CP10 A4, PD1, PD6, PD8) on the real API (`E2E_API=1`): the toggle keys,
 * the graph and the path text, the clock that keeps running, the view following the player,
 * and the debug marker on the result screen and in the stored result.
 */
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { begin, gameState, openGame, startRandom } from './game.js';
import { watchConsole, type DebugData } from './helpers.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://ogm:ogm@localhost:5432/ogm';

const elapsed = (page: Page) => page.evaluate(() => window.__ogm?.getState().elapsedMs ?? -1);

test('debug view: toggle keys, graph and path, clock keeps running, marker on the stored result', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const console = watchConsole(page);
  await openGame(page);
  await startRandom(page, 'Medium');
  await begin(page);
  const { gameId, seed } = await gameState(page);
  if (!gameId || !seed) throw new Error('no game');

  // Open with the key under Esc (ANSI): the pointer is released, the game keeps running.
  await page.keyboard.press('Backquote');
  const overlay = page.getByTestId('debug-overlay');
  await expect(overlay).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.getByTestId('pause-overlay')).toBeHidden();
  await expect(page.getByTestId('debug-seed')).toHaveText(seed);
  const pathText = page.getByTestId('debug-path-text');
  await expect(pathText).toHaveText(/^START \(.+ r\d\d\) → .+ → GOAL \(.+ r\d\d\)$/);

  // Every room is drawn; start, goal and current are marked; the path is highlighted.
  const data = (await page.evaluate(() => window.__ogm?.debug?.())) as DebugData;
  const startNode = page.getByTestId(`debug-node-${data.start}`);
  await expect(startNode).toHaveClass(/dbg-start/);
  await expect(startNode).toHaveClass(/dbg-current/);
  await expect(page.getByTestId(`debug-node-${data.goal}`)).toHaveClass(/dbg-goal/);
  await expect(page.getByTestId('debug-path-link')).toHaveCount(data.pathFromCurrent.length - 1);

  // PD1: the clock does not pause while the view is open.
  const t0 = await elapsed(page);
  await page.waitForTimeout(2000);
  expect(await elapsed(page)).toBeGreaterThanOrEqual(t0 + 1900);

  // Hovering a link shows its doors; the path from the start can be shown instead.
  await page.screenshot({ path: test.info().outputPath('debug-view.png') });
  await page.locator('.dbg-link').first().dispatchEvent('pointerover');
  await expect(page.getByTestId('debug-hover')).toHaveText(/^d\d(→|↔)d\d$/);
  await page.getByTestId('debug-from-start').check();
  await expect(pathText).toHaveText(/^START \(/);

  // The view follows the player: the autopilot walks on while the view is open.
  await page.getByTestId('debug-from-start').uncheck();
  const next = data.pathFromCurrent[1]?.room ?? '';
  const walking = page.evaluate(() => window.__ogm?.autopilot?.followPath() ?? 'missing');
  await expect(page.getByTestId(`debug-node-${next}`)).toHaveClass(/dbg-current/, {
    timeout: 60_000,
  });

  // F9 and the Apple ISO key close and open; Esc closes.
  await page.keyboard.press('F9');
  await expect(overlay).toBeHidden();
  // Playwright has no key for it: the event an Apple ISO keyboard sends.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'IntlBackslash', key: '§' }));
  });
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  // One click on the pause overlay locks the pointer again.
  await expect(page.getByTestId('pause-overlay')).toBeVisible();

  expect(await walking).toBe('completed');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('debug-marker')).toBeVisible();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ debug_used: boolean }>(
      'select debug_used from results where game_id = $1',
      [gameId],
    );
    expect(rows[0]?.debug_used).toBe(true);
  } finally {
    await client.end();
  }
  expect(console).toEqual([]);
});
