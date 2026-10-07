/**
 * Visual baselines on the fixture house (CP03 T7). Screenshots are taken with manual
 * stepping (`window.__ogm`), fixed quality and no HUD, so they are deterministic.
 */
import { expect, test } from '@playwright/test';
import { openFixtures, setPose, step, watchConsole, yawToDoor } from './helpers.js';

test.describe('fixture house visuals', () => {
  test('r00 facing d0: the kitchen through the doorway', async ({ page }) => {
    const console = watchConsole(page);
    await openFixtures(page);
    await setPose(page, 'r00', -0.5, 0.5, yawToDoor('r00', 'd0', -0.5, 0.5));
    await expect(page).toHaveScreenshot('r00-d0-kitchen.png');
    expect(console).toEqual([]);
  });

  test('r02 facing d1: the bedroom inside the bedroom (self-link)', async ({ page }) => {
    await openFixtures(page);
    await setPose(page, 'r02', -0.5, 0.5, yawToDoor('r02', 'd1', -0.5, 0.5));
    await expect(page).toHaveScreenshot('r02-d1-self-link.png');
  });

  test('r01 facing d3: the sealed door panel', async ({ page }) => {
    await openFixtures(page);
    await setPose(page, 'r01', 0.03, 0.02, yawToDoor('r01', 'd3', 0.03, 0.02));
    await expect(page).toHaveScreenshot('r01-d3-sealed.png');
  });

  test('r00 looking along three doors: recursion depth 3', async ({ page }) => {
    await openFixtures(page);
    await setPose(page, 'r00', -3, 0.23, 0.01);
    const levels = await page.evaluate(() => window.__ogm?.portalTree().map((n) => n.level));
    expect(Math.max(...(levels ?? [0]))).toBe(3);
    await expect(page).toHaveScreenshot('r00-depth3.png');
  });

  test('r04 looking through the kitchen into the living room and back into the hallway', async ({
    page,
  }) => {
    await openFixtures(page);
    await setPose(page, 'r04', 0.73, 1.02, -Math.PI / 2 + 0.01);
    const tree = await page.evaluate(() =>
      window.__ogm?.portalTree().map((n) => `${n.level}:${n.room}`),
    );
    expect(tree).toEqual(['0:r04', '1:r01', '2:r00', '3:r04']);
    await expect(page).toHaveScreenshot('r04-depth3.png');
  });

  test('walking through r00.d0 into r01: 7-frame sequence', async ({ page }) => {
    await openFixtures(page);
    // Pre-roll 9 steps to walking speed (0.25 m), then 2 steps (0.1 m) per frame. The eye is
    // 0.37 m from the portal plane in frame 0 and crosses it between frames 3 and 4. (Frames
    // avoid landing exactly on a wall plane, where vertices sit at w = 0.)
    await setPose(page, 'r00', -1, -3.28, 0);
    await step(page, 9, true);
    for (let frame = 0; frame < 7; frame++) {
      const state = await page.evaluate(() => window.__ogm?.getState());
      expect(state?.room).toBe(frame < 4 ? 'r00' : 'r01');
      await expect(page).toHaveScreenshot(`crossing-${frame}.png`);
      await step(page, 2, true);
    }
  });
});
