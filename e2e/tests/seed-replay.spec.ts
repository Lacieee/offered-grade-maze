/**
 * Seed replay (CP10 A4) on the real API (`E2E_API=1`): copy the seed from the result screen,
 * play this seed again, and get the same house: same start room, same furniture.
 */
import { expect, test } from '@playwright/test';
import { autopilotToResult, begin, gameState, openGame, roomDto, startRandom } from './game.js';
import { watchConsole } from './helpers.js';

test('copy the seed, play this seed again: same start room and furniture', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const console = watchConsole(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openGame(page);
  await startRandom(page, 'Easy');
  const first = await gameState(page);
  const startRoom = await page.evaluate(() => window.__ogm?.getState().room ?? '');
  const original = await roomDto(page, startRoom);
  await begin(page);
  await autopilotToResult(page);

  await page.getByTestId('copy-seed').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(first.seed);

  await page.getByTestId('play-again').click();
  await page.getByTestId('ready-screen').waitFor();
  const again = await gameState(page);
  expect(again.seed).toBe(copied);
  expect(again.gameId).not.toBe(first.gameId);
  expect(await page.evaluate(() => window.__ogm?.getState().room)).toBe(startRoom);
  expect(await roomDto(page, startRoom)).toEqual(original);
  expect(console).toEqual([]);
});
