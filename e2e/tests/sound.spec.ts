/**
 * Sound smoke test (CP09 T2–T6): the audio context starts in the click that starts play,
 * footsteps follow walking, the hum is on in the goal room, the completion stinger plays
 * exactly once and the pickup flashes. What it sounds like is a human check (G3).
 */
import { expect, test, type Page } from '@playwright/test';
import { begin, crossDoor, openGame, pathToGoal, startRandom, walkIntoGoal } from './game.js';
import { watchConsole } from './helpers.js';

const sound = (page: Page) =>
  page.evaluate(() => {
    const a = window.__ogmAudio;
    if (!a) return null;
    return {
      state: a.state(),
      footsteps: a.footsteps(),
      stingers: a.stingers(),
      hum: a.humAudible(),
    };
  });

test('audio starts on the click, footsteps while walking, hum near the goal, stinger once', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const console = watchConsole(page);
  await openGame(page, { mock: '1' });
  await startRandom(page, 'Easy');
  // No audio before the player clicks.
  expect(await sound(page)).toBeNull();
  await begin(page);
  await expect.poll(async () => (await sound(page))?.state).toBe('running');

  const doors = await pathToGoal(page);
  expect(doors.length).toBeGreaterThan(0);
  const first = doors[0] ?? '';
  await crossDoor(page, first);
  expect((await sound(page))?.footsteps).toBeGreaterThan(0);
  for (const door of doors.slice(1)) await crossDoor(page, door);
  // In the goal room the hum is on.
  await expect.poll(async () => (await sound(page))?.hum).toBe(true);
  expect((await sound(page))?.stingers).toBe(0);

  const flash = page.locator('.pickup-flash').waitFor({ state: 'attached', timeout: 10_000 });
  await walkIntoGoal(page);
  await flash;
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 30_000 });
  expect((await sound(page))?.stingers).toBe(1);
  // Still once, after the stinger and the 2 s music fade.
  await page.waitForTimeout(2500);
  expect((await sound(page))?.stingers).toBe(1);
  expect(console).toEqual([]);
});
