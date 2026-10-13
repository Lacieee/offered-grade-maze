/**
 * "The goal is the brightest object in the frame" (CP09 T1.5), measured on real screenshots.
 *
 * Room surfaces (walls, floor, ceiling, door frames) are not objects: the ceiling around a
 * lamp clips to white in every room. A second frame with the surfaces drawn black marks the
 * pixels that belong to objects; the halo is additive, so it stays visible there as well.
 */
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { decode } from './helpers.js';

export interface GoalBrightness {
  /** Brightest block (mean luminance 0–255) within half a halo radius of the goal. */
  goal: number;
  /** Brightest object block outside the halo. */
  other: number;
  /** Where that block is (px), for the failure message. */
  otherAt: { x: number; y: number };
  /** The goal's projection. */
  screen: { x: number; y: number; radius: number; level: number };
}

const luminance = (img: PNG, i: number): number =>
  0.2126 * (img.data[i] ?? 0) + 0.7152 * (img.data[i + 1] ?? 0) + 0.0722 * (img.data[i + 2] ?? 0);

/**
 * Measures the current view (call after `renderAt`); null if the goal is not in view. Blocks
 * are a third of the halo's radius (4–12 px), so a far goal is compared at its own size.
 */
export async function goalBrightness(page: Page): Promise<GoalBrightness | null> {
  const screen = await page.evaluate(() => window.__ogm?.goalScreen() ?? null);
  if (!screen) return null;
  const canvas = page.locator('canvas').first();
  const normal = decode(await canvas.screenshot());
  await page.evaluate(() => {
    window.__ogm?.maskSurfaces(true);
    window.__ogm?.renderAt(1);
  });
  const mask = decode(await canvas.screenshot());
  await page.evaluate(() => {
    window.__ogm?.maskSurfaces(false);
    window.__ogm?.renderAt(1);
  });

  const { width, height } = normal;
  const box = await canvas.boundingBox();
  const scale = width / (box?.width ?? width);
  const gx = screen.x * scale;
  const gy = screen.y * scale;
  const r = screen.radius * scale;
  const block = Math.round(Math.min(12, Math.max(4, r / 3)));
  let goal = 0;
  let other = 0;
  let otherAt = { x: 0, y: 0 };
  // Half-block stride so a bright spot on a block boundary is not split.
  const stride = Math.max(1, Math.floor(block / 2));
  for (let by = 0; by + block <= height; by += stride) {
    for (let bx = 0; bx + block <= width; bx += stride) {
      let sum = 0;
      let object = 0;
      for (let y = by; y < by + block; y++) {
        for (let x = bx; x < bx + block; x++) {
          const i = (y * width + x) * 4;
          sum += luminance(normal, i);
          if (luminance(mask, i) > 8) object++;
        }
      }
      const mean = sum / (block * block);
      const d = Math.hypot(bx + block / 2 - gx, by + block / 2 - gy);
      if (d <= r / 2) goal = Math.max(goal, mean);
      else if (d > r && object >= (block * block) / 2 && mean > other) {
        other = mean;
        otherAt = { x: bx + block / 2, y: by + block / 2 };
      }
    }
  }
  return { goal, other, otherAt, screen };
}
