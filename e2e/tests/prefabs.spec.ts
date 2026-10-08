import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { watchConsole } from './helpers.js';

declare global {
  interface Window {
    __gallery?: { ready: boolean; items: number };
  }
}

/** Opens the prefab gallery (CP06 T5) and waits for its first frames. */
async function openGallery(page: Page, query: Record<string, string> = {}): Promise<void> {
  const params = new URLSearchParams({ dev: 'prefabs', overlay: '0', ...query });
  await page.goto(`/?${params.toString()}`);
  await page.waitForFunction(() => window.__gallery?.ready === true, null, { timeout: 60_000 });
}

test('the prefab gallery renders every prefab and variant in two colour sets', async ({ page }) => {
  const console = watchConsole(page);
  await openGallery(page, { outlines: '1', camera: '8,8.5,22.5,0,-0.5' });
  // 45 prefabs with 59 variants in total, each in two colour sets.
  expect(await page.evaluate(() => window.__gallery?.items)).toBe(118);
  expect(console).toEqual([]);
});

test('the same painting params render identical pixels across reloads', async ({ page }) => {
  const shot = async (): Promise<string> => {
    await openGallery(page, { only: 'painting,sig_painting', camera: '3.2,1.6,4.6,0,-0.02' });
    return createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');
  };
  const first = await shot();
  const second = await shot();
  expect(second).toBe(first);
  await expect(page).toHaveScreenshot('paintings.png');
});

test('a generated house: every room renders and entering rooms never compiles shaders', async ({
  page,
}) => {
  const console = watchConsole(page);
  await page.goto('/?dev=level&file=sample-hard&overlay=0');
  await page.waitForFunction(() => window.__ogm !== undefined, null, { timeout: 60_000 });
  const rooms = await page.evaluate(() =>
    Array.from({ length: 23 }, (_, i) => `r${String(i).padStart(2, '0')}`),
  );
  const programs = async () => (await page.evaluate(() => window.__ogm?.info()))?.programs ?? 0;
  const before = await programs();
  for (const room of rooms) {
    for (let a = 0; a < 4; a++) {
      await page.evaluate(
        ([r, yaw]) => {
          window.__ogm?.setPose(r as string, 0.03, 0.02, yaw as number);
        },
        [room, (a / 4) * 2 * Math.PI + 0.01],
      );
    }
    expect((await page.evaluate(() => window.__ogm?.getState()))?.room).toBe(room);
  }
  expect(before).toBeGreaterThan(0);
  expect(await programs()).toBe(before);
  expect(console).toEqual([]);
});
