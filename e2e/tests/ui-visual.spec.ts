/**
 * Visual baselines of every UI screen in English and Hungarian, and of the debug view
 * (CP10 B2). The 3D canvas is hidden and the clocks are masked, so only the UI is compared.
 */
import { expect, test, type Page } from '@playwright/test';
import { begin, openGame, playToResult } from './game.js';

/** Hides the canvas (the 3D view is covered by the portal and crossing baselines). */
async function uiOnly(page: Page): Promise<void> {
  await page.addStyleTag({
    content: 'canvas { visibility: hidden !important; } * { caret-color: transparent !important; }',
  });
}

const shot = (page: Page, name: string, mask: string[] = []) =>
  expect(page).toHaveScreenshot(name, {
    mask: mask.map((id) => page.getByTestId(id)),
    maxDiffPixelRatio: 0.002,
  });

for (const lang of ['en', 'hu'] as const) {
  test.describe(`UI screens (${lang})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((l) => {
        localStorage.setItem('ogm.lang', l);
      }, lang);
    });

    test(`title, new game, seed, ready, pause, settings, result (${lang})`, async ({ page }) => {
      test.setTimeout(180_000);
      await openGame(page, { mock: '1' });
      await uiOnly(page);
      await shot(page, `${lang}-title.png`);
      await page.getByTestId('open-settings').click();
      await shot(page, `${lang}-settings.png`);
      await page.getByTestId('settings-done').click();
      await page.getByTestId('title-screen').getByRole('button').first().click();
      await expect(page.getByTestId('new-game-screen')).toBeVisible();
      await shot(page, `${lang}-new-game.png`);
      await page.getByRole('tab').nth(1).click();
      await page.getByTestId('seed-input').fill('M1-7K2Q-X9MP');
      await expect(page.getByTestId('start-button')).toBeEnabled();
      await shot(page, `${lang}-new-game-seed.png`);
      await page.getByRole('tab').nth(0).click();
      await page.locator('input[value="medium"]').check();
      await page.getByTestId('start-button').click();
      await page.getByTestId('ready-screen').waitFor();
      await shot(page, `${lang}-ready.png`);
      await begin(page);
      await page.evaluate(() => {
        document.exitPointerLock();
      });
      await expect(page.getByTestId('pause-overlay')).toBeVisible();
      await shot(page, `${lang}-pause.png`, ['hud-timer']);
      await playToResult(page);
      await shot(page, `${lang}-result.png`, ['result-time']);
    });

    test(`error screen (${lang})`, async ({ page }) => {
      await page.route('**/api/v1/games', (route) => route.abort('failed'));
      await openGame(page);
      await uiOnly(page);
      await page.getByTestId('title-screen').getByRole('button').first().click();
      await page.getByTestId('start-button').click();
      await expect(page.getByTestId('error-screen')).toBeVisible({ timeout: 30_000 });
      await shot(page, `${lang}-error.png`);
    });

    test(`debug view (${lang})`, async ({ page }) => {
      await openGame(page, { mock: '1' });
      await uiOnly(page);
      // Language-independent: the first title button is New game.
      await page.getByTestId('title-screen').getByRole('button').first().click();
      await page.locator('input[value="medium"]').check();
      await page.getByTestId('start-button').click();
      await page.getByTestId('ready-screen').waitFor();
      await begin(page);
      await page.keyboard.press('Backquote');
      await expect(page.getByTestId('debug-path-text')).toBeVisible();
      await shot(page, `${lang}-debug-view.png`, ['debug-elapsed', 'hud-timer']);
    });
  });
}
