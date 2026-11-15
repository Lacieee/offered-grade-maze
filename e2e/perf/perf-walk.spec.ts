/**
 * Performance walk (CP10 B1): a 3-minute autopilot walk on a Hard seed with `?perf=1`, in
 * Auto quality with the window maximised, and in Low quality at full screen. Writes the
 * perf log to `e2e/perf-results/` and checks the targets: average ≥ 60 FPS, p95 frame time
 * ≤ 16.7 ms, ≤ 12 passes per frame, no missing portal target, no shader compile after the
 * first visit to each room.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SECONDS = Number(process.env.PERF_SECONDS ?? 180);
const SEED = process.env.PERF_SEED ?? 'H1-7K2Q-X9MP';
const OUT = new URL('../perf-results/', import.meta.url);

interface Summary {
  seconds: number;
  frames: number;
  avgFps: number;
  p95Ms: number;
  maxPasses: number;
  missingPortalTargets: number;
  lateCompiles: unknown[];
  targets: Record<string, boolean>;
}

async function walk(page: Page, quality: 'auto' | 'low', name: string): Promise<void> {
  await page.goto(`/?perf=1&autopilot=1&quality=${quality}&seed=${SEED}`);
  await page.getByTestId('start-button').click();
  await page.getByTestId('ready-screen').click(); // a real click: Pointer Lock and audio
  // The log starts once the house is loaded and play has begun. (The pointer is locked, so
  // the button gets the event directly.)
  await page.getByTestId('perf-reset').dispatchEvent('click');
  const games = await page.evaluate(
    async (s) => (await window.__ogm?.autopilot?.tour(s)) ?? -1,
    SECONDS,
  );
  const raw = await page.getByTestId('perf-overlay').getAttribute('data-perf-summary');
  const summary = JSON.parse(raw ?? '{}') as Summary;
  const browser = page.context().browser();
  const report = {
    name,
    quality,
    seed: SEED,
    games,
    browser: `${browser?.browserType().name() ?? '?'} ${browser?.version() ?? ''}`,
    viewport: await page.evaluate(
      () => `${String(innerWidth)}×${String(innerHeight)} @${String(devicePixelRatio)}x`,
    ),
    userAgent: await page.evaluate(() => navigator.userAgent),
    at: new Date().toISOString(),
    summary,
  };
  mkdirSync(OUT, { recursive: true });
  const file = new URL(`perf-${name}-${report.at.replace(/[:.]/g, '-')}.json`, OUT);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  test.info().annotations.push({ type: 'perf log', description: file.pathname });
  expect.soft(summary.avgFps, 'average FPS').toBeGreaterThanOrEqual(60);
  expect.soft(summary.p95Ms, 'p95 frame time (ms)').toBeLessThanOrEqual(16.7);
  expect.soft(summary.maxPasses, 'passes per frame').toBeLessThanOrEqual(12);
  expect.soft(summary.missingPortalTargets, 'missing portal targets').toBe(0);
  expect.soft(summary.lateCompiles, 'shader compiles after the first visit').toEqual([]);
}

test('Hard seed, Auto quality, maximised window', async ({ page }) => {
  await walk(page, 'auto', 'auto');
});

test('Hard seed, Low quality, full screen', async ({ page }) => {
  await page.goto('/');
  // Full screen needs a user gesture.
  await page.locator('body').click();
  await page.evaluate(() => document.documentElement.requestFullscreen().catch(() => undefined));
  await walk(page, 'low', 'low-fullscreen');
});
