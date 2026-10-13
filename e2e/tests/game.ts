/**
 * Helpers that drive the game UI and walk through houses with the test hook (CP08).
 */
import { expect, type Page } from '@playwright/test';
import type { RoomDto } from './helpers.js';

/** Opens the game (title screen) with the given query. */
export async function openGame(page: Page, query: Record<string, string> = {}): Promise<void> {
  await page.goto(`/?${new URLSearchParams(query).toString()}`);
  await page.waitForFunction(() => window.__ogm?.game !== undefined, null, { timeout: 30_000 });
}

/** The game state from the hook. */
export async function gameState(page: Page) {
  const s = await page.evaluate(() => window.__ogm?.game?.());
  if (!s) throw new Error('no game hook');
  return s;
}

/** From the title or result screen: start a random game of `difficulty`, wait for Ready. */
export async function startRandom(
  page: Page,
  difficulty: 'Easy' | 'Medium' | 'Hard',
): Promise<void> {
  if (await page.getByTestId('title-screen').isVisible()) {
    await page.getByRole('button', { name: 'New game' }).click();
  }
  await page.getByText(difficulty, { exact: true }).click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('ready-screen').waitFor({ timeout: 30_000 });
}

/** Clicks the Ready screen and waits until playing. */
export async function begin(page: Page): Promise<void> {
  await page.getByTestId('ready-screen').click();
  await page.waitForFunction(() => window.__ogm?.game?.().phase === 'playing');
}

/** A room DTO the client has (waits until it arrived). */
export async function roomDto(page: Page, id: string): Promise<RoomDto> {
  await page.waitForFunction((r) => window.__ogm?.roomDto(r) !== undefined, id, {
    timeout: 20_000,
  });
  const dto = await page.evaluate((r) => window.__ogm?.roomDto(r), id);
  if (!dto) throw new Error(`room ${id} missing`);
  return dto;
}

/**
 * Pace of a scripted walk (ms): a player needs at least this long to walk to the next door.
 * Without it a script crosses rooms faster than any player and outruns streaming.
 */
export const WALK_MS = 1000;

/** Walks through `door` of the current room (stands in front of it, then walks forward). */
export async function crossDoor(page: Page, door: string, paceMs = WALK_MS): Promise<string> {
  const { room } = await page.evaluate(() => window.__ogm?.getState() ?? { room: '' });
  const pose = await page.evaluate(
    ([r, d]) => window.__ogm?.doorPose(r ?? '', d ?? '', 0.8),
    [room, door],
  );
  if (!pose) throw new Error(`no door ${room}.${door}`);
  await page.evaluate(
    ([r, x, z, yaw]) => {
      window.__ogm?.setPose(r, x, z, yaw, 0);
    },
    [room, pose.x, pose.z, pose.yaw] as const,
  );
  // Look at the door for a while (the portal renders), as a player walking up to it would.
  await page.waitForTimeout(paceMs);
  // Walk through in small steps, rendering in between (like real frames).
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      window.__ogm?.step(10, { forward: true });
    });
    const now = await page.evaluate(() => window.__ogm?.getState().room ?? '');
    if (now !== room) return now;
  }
  const why = await page.evaluate(
    ([r, d]) => {
      const link = window.__ogm?.roomDto(r ?? '')?.doors.find((x) => x.id === d)?.link;
      return {
        link,
        targetKnown: link ? window.__ogm?.roomDto(link.room) !== undefined : null,
        targetBuilt: link ? window.__ogm?.doorPose(link.room, link.door, 0.5) !== null : null,
        info: window.__ogm?.info(),
        game: window.__ogm?.game?.(),
      };
    },
    [room, door],
  );
  throw new Error(`did not get through ${room}.${door}: ${JSON.stringify(why)}`);
}

/** Shortest door path to the room with the goal, over the rooms the client knows now. */
export async function pathToGoal(page: Page): Promise<string[]> {
  const start = await page.evaluate(() => window.__ogm?.getState().room ?? '');
  const prev = new Map<string, { from: string; door: string } | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift() ?? '';
    const dto = await page.evaluate((r) => window.__ogm?.roomDto(r), id);
    if (!dto) continue;
    if (dto.goal) {
      const doors: string[] = [];
      for (let at = prev.get(id); at; at = prev.get(at.from)) doors.unshift(at.door);
      return doors;
    }
    for (const d of dto.doors) {
      if (d.link && !prev.has(d.link.room)) {
        prev.set(d.link.room, { from: id, door: d.id });
        queue.push(d.link.room);
      }
    }
  }
  throw new Error('no goal reachable');
}

/** Walks into the goal of the current room (from 1.5 m away). */
export async function walkIntoGoal(page: Page): Promise<void> {
  const { room } = await page.evaluate(() => window.__ogm?.getState() ?? { room: '' });
  const goal = (await roomDto(page, room)).goal;
  if (!goal) throw new Error(`no goal in ${room}`);
  await page.evaluate(
    ([r, x, z]) => {
      window.__ogm?.setPose(r, x, z + 1.5, 0, 0);
      window.__ogm?.step(60, { forward: true });
    },
    [room, goal.x, goal.z] as const,
  );
}

/**
 * Plays to the goal and waits for the result screen: through `doors` if given (the real
 * API's debug path), else the shortest path over the rooms the client knows.
 */
export async function playToResult(page: Page, doors?: readonly string[]): Promise<void> {
  for (const door of doors ?? (await pathToGoal(page))) await crossDoor(page, door);
  await walkIntoGoal(page);
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 30_000 });
}
