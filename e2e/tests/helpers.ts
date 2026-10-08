import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

/** Mirror of the client's `window.__ogm` test hook (packages/client/src/dev/testHook.ts). */
interface OgmHook {
  getState(): { room: string; x: number; z: number; yaw: number; pitch: number };
  setPose(room: string, x: number, z: number, yaw: number, pitch?: number): void;
  step(n: number, keys?: Partial<Record<'forward' | 'back' | 'left' | 'right', boolean>>): void;
  renderAt(alpha: number): void;
  info(): {
    programs: number;
    passes: number;
    qualityLevel: number;
    qualityMode: string;
    contextLost: boolean;
    drawCalls: number;
  };
  portalTree(): {
    room: string;
    level: number;
    rect: { x0: number; y0: number; x1: number; y1: number };
  }[];
  setQuality(mode: 'auto' | 'high' | 'low'): void;
  slowFrames(ms: number): void;
  portalCheck(door: string): { meanDiff: number; maxDiff: number; pixels: number };
}

declare global {
  interface Window {
    __ogm?: OgmHook;
  }
}

/** Fixture doors: portal-plane centre (room coordinates) and wall. */
export const DOORS: Record<
  string,
  Record<string, { at: [number, number]; wall: 'N' | 'E' | 'S' | 'W' }>
> = {
  r00: {
    d0: { at: [-1, -3.9], wall: 'N' },
    d1: { at: [3.65, 1.5], wall: 'E' },
    d2: { at: [-3.65, -0.5], wall: 'W' },
  },
  r01: {
    d0: { at: [-0.5, 2.65], wall: 'S' },
    d1: { at: [-2.65, 0.75], wall: 'W' },
    d2: { at: [1, -2.65], wall: 'N' },
    d3: { at: [2.65, 0], wall: 'E' },
  },
  r02: { d0: { at: [0, 2.9], wall: 'S' }, d1: { at: [2.65, -1], wall: 'E' } },
  r03: { d0: { at: [0, 1.9], wall: 'S' }, d1: { at: [0.5, -1.9], wall: 'N' } },
  r04: {
    d0: { at: [0, 4.15], wall: 'S' },
    d1: { at: [0, -4.15], wall: 'N' },
    d2: { at: [1.4, 2], wall: 'E' },
  },
  r05: { d0: { at: [0.5, 2.4], wall: 'S' }, d1: { at: [-2.4, -0.75], wall: 'W' } },
};

const INWARD = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] } as const;

function door(room: string, id: string) {
  const d = DOORS[room]?.[id];
  if (!d) throw new Error(`unknown door ${room}.${id}`);
  return d;
}

/** Yaw that looks from (x, z) toward (tx, tz); 0 looks toward −Z. */
export function yawToward(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

/** Yaw from (x, z) toward a fixture door's centre. */
export function yawToDoor(room: string, id: string, x: number, z: number): number {
  const [tx, tz] = door(room, id).at;
  return yawToward(x, z, tx, tz);
}

/** A point `dist` metres into the room straight in front of a door, facing it. */
export function frontOf(
  room: string,
  id: string,
  dist: number,
): { x: number; z: number; yaw: number } {
  const d = door(room, id);
  const [ix, iz] = INWARD[d.wall];
  const x = d.at[0] + ix * dist;
  const z = d.at[1] + iz * dist;
  return { x, z, yaw: yawToward(x, z, d.at[0], d.at[1]) };
}

/** Collects console errors and warnings (and page errors) for a page. */
export function watchConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (m) => {
    // The software GL driver (SwiftShader) reports performance hints such as "GPU stall due
    // to ReadPixels" when the test reads pixels back. They come from the test, not the app.
    if (/GL Driver Message \(OpenGL, Performance,/.test(m.text())) return;
    if (m.type() === 'error' || m.type() === 'warning') messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  return messages;
}

/** Opens the fixture house with the test hook ready. */
export async function openFixtures(page: Page, params: Record<string, string> = {}): Promise<void> {
  const query = new URLSearchParams({
    dev: 'fixtures',
    room: 'r00',
    overlay: '0',
    quality: 'high',
    ...params,
  });
  await page.goto(`/?${query.toString()}`);
  await page.waitForFunction(() => window.__ogm !== undefined, null, { timeout: 30_000 });
}

/**
 * Places the player and waits for two rendered frames.
 *
 * Test poses avoid exact grid coordinates with axis-aligned yaw: there, floor and ceiling
 * vertices lie exactly on the camera plane (clip w = 0), which SwiftShader drops (ADR-0003).
 */
export async function setPose(
  page: Page,
  room: string,
  x: number,
  z: number,
  yaw: number,
  pitch = 0,
): Promise<void> {
  await page.evaluate(
    ([r, px, pz, py, pp]) => {
      window.__ogm?.setPose(r, px, pz, py, pp);
    },
    [room, x, z, yaw, pitch] as const,
  );
  await frames(page, 2);
}

/** Advances n simulation steps (optionally walking forward) and waits for two frames. */
export async function step(page: Page, n: number, forward = false): Promise<void> {
  await page.evaluate(
    ([count, fwd]) => {
      window.__ogm?.step(count, fwd ? { forward: true } : {});
    },
    [n, forward] as const,
  );
  await frames(page, 2);
}

/** Waits for `n` animation frames. */
export async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, n);
}

/** Decodes a PNG screenshot. */
export function decode(png: Buffer): PNG {
  return PNG.sync.read(png);
}

/** Mean absolute per-channel difference (0–255) between two equally sized images. */
export function meanAbsDiff(a: PNG, b: PNG): number {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs((a.data[i + c] ?? 0) - (b.data[i + c] ?? 0));
      n++;
    }
  }
  return sum / n;
}

/** Number of (near-)black pixels: all channels below 3. */
export function blackPixels(img: PNG): number {
  let count = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if ((img.data[i] ?? 0) < 3 && (img.data[i + 1] ?? 0) < 3 && (img.data[i + 2] ?? 0) < 3) {
      count++;
    }
  }
  return count;
}
