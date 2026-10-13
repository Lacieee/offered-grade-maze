/**
 * The production build (CP10 A3 acceptance) as the server serves it (`E2E_API=1`, after
 * `pnpm build`): no test hook, and `?autopilot=1` exposes only the autopilot, which can
 * play a game for a live demonstration.
 */
import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers.js';

const RELEASE = `http://localhost:${process.env.E2E_API_PORT ?? '8090'}`;

test('production build: window.__ogm is undefined', async ({ page }) => {
  const console = watchConsole(page);
  await page.goto(`${RELEASE}/`);
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => typeof window.__ogm)).toBe('undefined');
  expect(console).toEqual([]);
});

test('production build with ?autopilot=1: only the autopilot, and it plays a game', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const console = watchConsole(page);
  await page.goto(`${RELEASE}/?autopilot=1`);
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => Object.keys(window.__ogm ?? {}))).toEqual(['autopilot']);

  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByText('Easy', { exact: true }).click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('ready-screen').click();
  const result = await page.evaluate(() => window.__ogm?.autopilot?.followPath());
  expect(result).toBe('completed');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 30_000 });
  expect(console).toEqual([]);
});
