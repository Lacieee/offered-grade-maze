/**
 * End-to-end playthroughs (CP10 A4) on the real API (`E2E_API=1`): for 3 fixed seeds per
 * difficulty, start the game through the UI, let the autopilot follow the debug path with
 * the normal controls, then check the result screen, the stored result and that no portal
 * ever showed an unbuilt room.
 */
import { expect, test } from '@playwright/test';
import { autopilotToResult, begin, gameState, openGame, startSeed } from './game.js';
import { watchConsole } from './helpers.js';

/** 3 fixed seeds per difficulty. */
export const PLAYTHROUGH_SEEDS = [
  'E1-7K2Q-X9MP',
  'E1-0000-0003',
  'E1-0000-0006',
  'M1-7K2Q-X9MP',
  'M1-0000-0005',
  'M1-0000-0007',
  'H1-7K2Q-X9MP',
  'H1-0000-0004',
  'H1-0000-0008',
] as const;

for (const seed of PLAYTHROUGH_SEEDS) {
  test(`autopilot plays ${seed} to the goal; the result is stored`, async ({ page }) => {
    test.setTimeout(600_000);
    const console = watchConsole(page);
    await openGame(page);
    await startSeed(page, seed);
    await begin(page);
    const { gameId } = await gameState(page);
    if (!gameId) throw new Error('no game');
    await autopilotToResult(page);

    await expect(page.getByTestId('seed-code')).toHaveText(seed);
    const shown = await page.getByTestId('result-time').textContent();
    // The stored result, via the API: completing again returns it unchanged.
    const res = await page.request.post(`/api/v1/games/${gameId}/complete`, {
      data: { lastSeq: (await gameState(page)).lastSeq, clientElapsedMs: 1, debugUsed: false },
    });
    expect(res.ok()).toBe(true);
    const { result } = (await res.json()) as {
      result: { seed: string; completionMs: number; debugUsed: boolean };
    };
    expect(result.seed).toBe(seed);
    // The autopilot reads the debug path, so the result is flagged (PD8).
    expect(result.debugUsed).toBe(true);
    const ms = result.completionMs;
    const s = Math.floor(ms / 1000);
    expect(shown).toBe(
      `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(Math.floor(ms / 10) % 100).padStart(2, '0')}`,
    );
    const info = await page.evaluate(() => window.__ogm?.info());
    const missing = await page.evaluate(() => window.__ogm?.missingLog() ?? []);
    expect(info?.missingPortalTargets, missing.join(', ')).toBe(0);
    expect(console).toEqual([]);
  });
}
