/**
 * Settings (CP09 T7): reachable from the title screen and the pause overlay, in English and
 * Hungarian; changes apply live and survive a reload (`ogm.settings`).
 */
import { expect, test, type Page } from '@playwright/test';
import { begin, openGame, startRandom } from './game.js';
import { watchConsole } from './helpers.js';

/** Sets a range input to `value` (fires React's change event). */
async function slide(page: Page, testId: string, value: number): Promise<void> {
  await page.getByTestId(testId).fill(String(value));
}

const info = (page: Page) =>
  page.evaluate(() => {
    const i = window.__ogm?.info();
    if (!i) throw new Error('no hook');
    return i;
  });

test('settings apply live and persist across a reload', async ({ page }) => {
  const console = watchConsole(page);
  await openGame(page, { mock: '1' });
  const before = await info(page);
  expect(before.fov).toBe(75);
  expect(before.invertY).toBe(false);

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await slide(page, 'set-fov', 88);
  await slide(page, 'set-sensitivity', 1.5);
  await page.getByTestId('set-invert').check();
  await page.getByTestId('set-bob').uncheck();
  await slide(page, 'set-music', 30);
  await page.getByTestId('set-quality').selectOption('low');

  // Live: the engine already uses them.
  const live = await info(page);
  expect(live.fov).toBe(88);
  expect(live.sensitivity).toBeCloseTo(before.sensitivity * 1.5, 9);
  expect(live.invertY).toBe(true);
  expect(live.headBob).toBe(false);
  expect(live.qualityMode).toBe('low');
  await page.getByTestId('settings-done').click();
  await expect(page.getByTestId('settings-screen')).toBeHidden();

  const stored = await page.evaluate(() => localStorage.getItem('ogm.settings'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({
    version: 1,
    fov: 88,
    sensitivity: 1.5,
    invertY: true,
    headBob: false,
    music: 30,
    quality: 'low',
  });

  await page.reload();
  await page.waitForFunction(() => window.__ogm?.game !== undefined);
  const after = await info(page);
  expect(after).toMatchObject({ fov: 88, invertY: true, headBob: false, qualityMode: 'low' });
  expect(after.sensitivity).toBeCloseTo(before.sensitivity * 1.5, 9);
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('set-fov')).toHaveValue('88');
  await expect(page.getByTestId('set-music')).toHaveValue('30');
  await expect(page.getByTestId('set-invert')).toBeChecked();

  // Reset to defaults.
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByTestId('set-fov')).toHaveValue('75');
  expect((await info(page)).fov).toBe(75);
  expect(console).toEqual([]);
});

test('the settings screen opens from the pause overlay, in Hungarian too', async ({ page }) => {
  await openGame(page, { mock: '1' });
  await page.getByRole('button', { name: 'HU', exact: true }).click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByRole('heading', { name: 'Beállítások' })).toBeVisible();
  await expect(page.getByText('Egérérzékenység')).toBeVisible();
  await expect(page.getByText('Látószög')).toBeVisible();
  // The language select switches back to English.
  await page.getByTestId('set-lang').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-screen')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('ogm.lang'))).toBe('en');

  await startRandom(page, 'Easy');
  await begin(page);
  await page.evaluate(() => {
    document.exitPointerLock();
  });
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByTestId('pause-overlay').getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await slide(page, 'set-fov', 62);
  expect((await info(page)).fov).toBe(62);
  await page.getByTestId('settings-done').click();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
});
