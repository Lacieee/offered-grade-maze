/**
 * The player journey on the in-browser mock API (CP08): screens, i18n, seed links, the
 * timer, streaming and the result. The real-API versions are in `api.spec.ts`.
 */
import { expect, test } from '@playwright/test';
import { begin, crossDoor, gameState, openGame, playToResult, startRandom } from './game.js';
import { watchConsole } from './helpers.js';

test('English by default; HU translates the visible strings; back to EN', async ({ page }) => {
  const console = watchConsole(page);
  await openGame(page, { mock: '1' });
  await expect(page.getByRole('heading', { name: 'Offered Grade Maze' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await page.getByRole('button', { name: 'HU' }).click();
  await expect(page.getByRole('button', { name: 'Új játék' })).toBeVisible();
  await expect(page.getByText('WASD: mozgás')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ogm.lang'))).toBe('hu');
  await page.getByRole('button', { name: 'Új játék' }).click();
  await expect(page.getByRole('tab', { name: 'Véletlen ház' })).toBeVisible();
  await expect(page.getByText('Könnyű', { exact: true })).toBeVisible();
  // The choice survives a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Új játék' })).toBeVisible();
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  expect(console).toEqual([]);
});

test('a seed link opens the seed tab prefilled and validated; typing validates live', async ({
  page,
}) => {
  await openGame(page, { mock: '1', seed: 'm1-7k2q-x9mp' });
  await expect(page.getByTestId('seed-input')).toHaveValue('M1-7K2Q-X9MP');
  await expect(page.getByTestId('seed-check')).toHaveText('Medium house, generator version 1');
  await page.getByTestId('seed-input').fill('Q1-0000');
  await expect(page.getByTestId('seed-check')).toContainText('10 letters');
  await expect(page.getByTestId('start-button')).toBeDisabled();
  await page.getByTestId('seed-input').fill('H1 7K2Q X9MP');
  await expect(page.getByTestId('seed-check')).toHaveText('Hard house, generator version 1');
  await page.getByTestId('start-button').click();
  await page.getByTestId('ready-screen').waitFor();
  expect((await gameState(page)).seed).toBe('H1-7K2Q-X9MP');
});

test('full journey: play, result, copy seed, play this seed again', async ({ page, context }) => {
  const console = watchConsole(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openGame(page, { mock: '1', latency: '300' });
  await startRandom(page, 'Medium');
  await expect(page.getByTestId('ready-screen')).toContainText('Click to start');
  await begin(page);
  await expect(page.getByTestId('hud-timer')).toBeVisible();
  const first = await gameState(page);
  await playToResult(page);
  await expect(page.getByText('You got the Offered Grade!').first()).toBeVisible();
  await expect(page.getByTestId('result-time')).toHaveText(/^\d\d:\d\d\.\d\d$/);
  await expect(page.getByTestId('result-difficulty')).toHaveText('Medium');
  await page.getByTestId('copy-seed').click();
  await expect(page.getByTestId('copy-seed')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first.seed);
  await page.getByTestId('play-again').click();
  await page.getByTestId('ready-screen').waitFor();
  const again = await gameState(page);
  expect(again.seed).toBe(first.seed);
  expect(again.gameId).not.toBe(first.gameId);
  expect(console).toEqual([]);
});

test('the timer keeps running in the pause overlay and while the tab is hidden (PD1)', async ({
  page,
  context,
}) => {
  await openGame(page, { mock: '1' });
  await startRandom(page, 'Easy');
  await begin(page);
  const seconds = async () => {
    const [m, s] = ((await page.getByTestId('hud-timer').textContent()) ?? '0:0')
      .split(':')
      .map(Number);
    return (m ?? 0) * 60 + (s ?? 0);
  };
  await page.evaluate(() => {
    document.exitPointerLock();
  });
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await expect(page.getByText('The timer keeps running.')).toBeVisible();
  const t0 = await seconds();
  await page.waitForTimeout(2500);
  expect(await seconds()).toBeGreaterThanOrEqual(t0 + 2);

  // Hide the tab behind another one, then come back.
  const other = await context.newPage();
  await other.bringToFront();
  await other.waitForTimeout(3000);
  await page.bringToFront();
  await page.waitForTimeout(300);
  expect(await seconds()).toBeGreaterThanOrEqual(t0 + 5);
  await other.close();
});

test('the HUD timer does not re-render React every frame', async ({ page }) => {
  await openGame(page, { mock: '1' });
  await startRandom(page, 'Easy');
  await begin(page);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__ogmHudRenders ?? 0);
  const text = await page.getByTestId('hud-timer').textContent();
  await page.waitForTimeout(2200);
  expect(await page.getByTestId('hud-timer').textContent()).not.toBe(text);
  expect(await page.evaluate(() => window.__ogmHudRenders ?? 0)).toBe(before);
});

test('streaming on the mock API with 300 ms latency: 20 runs, never a missing portal target', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await openGame(page, { mock: '1', latency: '300' });
  for (let run = 0; run < 20; run++) {
    if (run === 0) await startRandom(page, 'Medium');
    else {
      await page.getByTestId('play-again').click();
      await page.getByTestId('ready-screen').waitFor();
    }
    await begin(page);
    // A detour through every door of the start room's first link, then the goal.
    const s = await page.evaluate(() => window.__ogm?.getState().room ?? '');
    const start = await page.evaluate((r) => window.__ogm?.roomDto(r), s);
    const door = start?.doors.find((d) => d.link !== null);
    if (door) await crossDoor(page, door.id);
    await playToResult(page);
    const info = await page.evaluate(() => window.__ogm?.info());
    expect(info?.missingPortalTargets, `run ${String(run)}`).toBe(0);
    const g = await gameState(page);
    expect(await page.evaluate((id) => window.__ogmMock?.lastSeq(id ?? ''), g.gameId)).toBe(
      g.lastSeq,
    );
  }
});
