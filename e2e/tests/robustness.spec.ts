/**
 * Latency robustness (CP10 B2), long: 100 autopilot runs, Easy and Medium mixed, with a
 * 300 ms delay on every API route, on the real API. Every run must complete with no empty
 * doorway (no missing portal target). Opt-in: `E2E_API=1 E2E_LONG=1` (about 1 h in
 * SwiftShader); `E2E_RUNS` changes the number of runs.
 */
import { expect, test } from '@playwright/test';
import { autopilotToResult, begin, openGame, startRandom } from './game.js';
import { watchConsole } from './helpers.js';

const RUNS = Number(process.env.E2E_RUNS ?? 100);

test(`${String(RUNS)} autopilot runs with 300 ms API latency: all complete, no empty doorway`, async ({
  page,
}) => {
  test.skip(process.env.E2E_LONG !== '1', 'long test: set E2E_LONG=1');
  test.setTimeout(RUNS * 180_000);
  const console = watchConsole(page);
  await page.route('**/api/v1/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await openGame(page);
  const missing: string[] = [];
  for (let run = 0; run < RUNS; run++) {
    if (run > 0) await page.getByRole('button', { name: 'New game' }).click();
    await startRandom(page, run % 2 === 0 ? 'Easy' : 'Medium');
    await begin(page);
    await autopilotToResult(page);
    const info = await page.evaluate(() => window.__ogm?.info());
    if ((info?.missingPortalTargets ?? 0) > 0) {
      const log = await page.evaluate(() => window.__ogm?.missingLog() ?? []);
      missing.push(`run ${String(run)}: ${log.join(', ')}`);
    }
  }
  test.info().annotations.push({ type: 'runs', description: `${String(RUNS)} completed` });
  expect(missing).toEqual([]);
  expect(console).toEqual([]);
});
