/**
 * Portal acceptance checks (CP03 §7) on the fixture house.
 */
import { expect, test } from '@playwright/test';
import {
  blackPixels,
  decode,
  frames,
  frontOf,
  meanAbsDiff,
  openFixtures,
  setPose,
  step,
  watchConsole,
  yawToDoor,
} from './helpers.js';

/** Ten poses with a level-1 portal in view: [room, door, x, z, yaw offset, pitch]. */
const POSES: [string, string, number, number, number, number][] = [
  ['r00', 'd0', 0, 0, 0, 0],
  ['r00', 'd0', -1.5, -1.5, 0.15, 0.1],
  ['r00', 'd2', 1.5, -0.5, 0, 0],
  ['r00', 'd1', -1, 1, -0.1, -0.15],
  ['r01', 'd2', -0.5, 0.5, 0, 0],
  ['r01', 'd1', 1, 1, 0.1, 0],
  ['r02', 'd1', -1, 0.5, 0, 0.05],
  ['r04', 'd1', 0, 1.5, 0, 0],
  ['r05', 'd1', 1, -0.5, 0, 0],
  ['r03', 'd1', -0.2, 0.6, 0, 0.2],
];

test('portal image matches a direct render of the target room (10 poses)', async ({ page }) => {
  const console = watchConsole(page);
  await openFixtures(page);
  const diffs: string[] = [];
  for (const [room, door, x, z, yawOffset, pitch] of POSES) {
    await setPose(page, room, x, z, yawToDoor(room, door, x, z) + yawOffset, pitch);
    const result = await page.evaluate((d) => window.__ogm?.portalCheck(d), door);
    expect(result, `${room}.${door}`).toBeDefined();
    expect(result?.pixels, `${room}.${door} pixels`).toBeGreaterThan(2000);
    expect(result?.meanDiff, `${room}.${door} mean diff`).toBeLessThan(2.5);
    diffs.push(
      `${room}.${door}: ${result?.meanDiff.toFixed(3) ?? '?'} (${result?.pixels ?? 0} px)`,
    );
  }
  test.info().annotations.push({ type: 'mean diff /255', description: diffs.join('; ') });
  expect(console).toEqual([]);
});

test('crossing r00.d0 is seamless: the crossing frame changes no more than the others', async ({
  page,
}) => {
  await openFixtures(page);
  await setPose(page, 'r00', -1, -3.28, 0);
  await step(page, 9, true);
  const shots: ReturnType<typeof decode>[] = [];
  for (let frame = 0; frame < 7; frame++) {
    shots.push(decode(await page.screenshot()));
    await step(page, 2, true);
  }
  const changes = shots.slice(1).map((img, i) => meanAbsDiff(shots[i] ?? img, img));
  const crossing = changes[3] ?? 0; // frame 3 → 4 crosses the portal plane
  const others = changes.filter((_, i) => i !== 3);
  const average = others.reduce((a, b) => a + b, 0) / others.length;
  test.info().annotations.push({
    type: 'frame changes',
    description: changes.map((c) => c.toFixed(2)).join(', '),
  });
  expect(crossing).toBeLessThanOrEqual(1.5 * average);
});

test('the spec §2 scenario: links behave as the fixture house defines', async ({ page }) => {
  await openFixtures(page);
  const walkThrough = async (room: string, door: string): Promise<string> => {
    // Stand 0.8 m in front of the door, facing it, and walk through.
    const p = frontOf(room, door, 0.8);
    await setPose(page, room, p.x, p.z, p.yaw);
    await step(page, 60, true);
    const state = await page.evaluate(() => window.__ogm?.getState());
    return state?.room ?? '';
  };
  expect(await walkThrough('r00', 'd0')).toBe('r01'); // living → kitchen
  expect(await walkThrough('r01', 'd0')).toBe('r00'); // back through the same door
  expect(await walkThrough('r01', 'd1')).toBe('r00'); // kitchen's other door → same living room
  expect(await walkThrough('r00', 'd2')).toBe('r04'); // back through that door → hallway
  expect(await walkThrough('r01', 'd2')).toBe('r02'); // kitchen → bedroom
  expect(await walkThrough('r02', 'd0')).toBe('r03'); // turn around: same doorway → bathroom
  expect(await walkThrough('r02', 'd1')).toBe('r02'); // self-link
  expect(await walkThrough('r03', 'd0')).toBe('r01'); // bathroom → kitchen (one-way: back
  // through that kitchen door leads to the bedroom, not the bathroom)
  const state0 = await page.evaluate(() => window.__ogm?.getState());
  expect(state0?.room).toBe('r01');
  expect(await walkThrough('r01', 'd2')).toBe('r02');
  // The kitchen's sealed door is decorative (PD9): walking at it goes nowhere.
  const sealed = frontOf('r01', 'd3', 0.8);
  await setPose(page, 'r01', sealed.x, sealed.z, sealed.yaw);
  await step(page, 60, true);
  const state = await page.evaluate(() => window.__ogm?.getState());
  expect(state?.room).toBe('r01');
  expect(state?.x ?? 0).toBeLessThan(2.5);
});

test('recursion depth 3 is visible; deeper portals show the fallback colour, never black', async ({
  page,
}) => {
  await openFixtures(page);
  for (const [room, x, z, yaw] of [
    ['r04', 0.73, 1.02, -Math.PI / 2 + 0.01],
    ['r00', -3, 0.23, 0.01],
    ['r02', -1, 0.5, yawToDoor('r02', 'd1', -1, 0.5)],
  ] as const) {
    await setPose(page, room, x, z, yaw);
    const tree = await page.evaluate(() => window.__ogm?.portalTree() ?? []);
    expect(tree.length).toBeGreaterThan(1);
    expect(Math.max(...tree.map((n) => n.level))).toBeLessThanOrEqual(3);
    const img = decode(await page.screenshot());
    expect(blackPixels(img), `${room} black pixels`).toBe(0);
  }
});

test('at most 12 render passes per frame', async ({ page }) => {
  await openFixtures(page);
  let maxPasses = 0;
  for (const room of ['r00', 'r01', 'r02', 'r03', 'r04', 'r05']) {
    for (let a = 0; a < 8; a++) {
      await setPose(page, room, 0.03, 0.02, (a / 8) * 2 * Math.PI + 0.01);
      const info = await page.evaluate(() => window.__ogm?.info());
      maxPasses = Math.max(maxPasses, info?.passes ?? 0);
    }
  }
  expect(maxPasses).toBeGreaterThan(1);
  expect(maxPasses).toBeLessThanOrEqual(12);
});

test('no shader compilation when entering a room after the first visit', async ({ page }) => {
  await openFixtures(page);
  const visit = async () => {
    for (const room of ['r00', 'r01', 'r02', 'r03', 'r04', 'r05']) {
      for (let a = 0; a < 4; a++)
        await setPose(page, room, 0.03, 0.02, (a / 4) * 2 * Math.PI + 0.01);
    }
    return (await page.evaluate(() => window.__ogm?.info()))?.programs ?? 0;
  };
  const first = await visit();
  const second = await visit();
  expect(first).toBeGreaterThan(0);
  expect(second).toBe(first);
});

test('forced slow frames step quality down; high quality stays pinned', async ({ page }) => {
  await openFixtures(page, { quality: 'auto' });
  await page.evaluate(() => {
    window.__ogm?.slowFrames(30);
  });
  await expect
    .poll(async () => (await page.evaluate(() => window.__ogm?.info()))?.qualityLevel ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__ogm?.setQuality('high');
  });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => window.__ogm?.info());
  expect(info?.qualityLevel).toBe(0);
  expect(info?.qualityMode).toBe('high');
});

test('a lost WebGL context is restored without reloading the page', async ({ page }) => {
  await openFixtures(page, { overlay: '1' });
  await setPose(page, 'r00', 0, 0, yawToDoor('r00', 'd0', 0, 0));
  await page.evaluate(() => {
    (window as unknown as { marker: number }).marker = 42;
  });
  const lose = await page.evaluateHandle(() => {
    const canvas = document.querySelector('.game-host canvas');
    const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null;
    return gl?.getExtension('WEBGL_lose_context') ?? null;
  });
  await lose.evaluate((ext) => ext?.loseContext());
  await expect(page.getByTestId('graphics-reset')).toBeVisible();
  await lose.evaluate((ext) => ext?.restoreContext());
  await expect(page.getByTestId('graphics-reset')).toBeHidden();
  await frames(page, 3);
  const info = await page.evaluate(() => window.__ogm?.info());
  expect(info?.contextLost).toBe(false);
  expect(info?.passes).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(42);
  const img = decode(await page.screenshot());
  expect(blackPixels(img)).toBeLessThan(img.width * img.height * 0.01);
  expect(meanAbsDiff(img, img)).toBe(0);
});

test('frames between the two states of a crossing step never flash (G1 feedback)', async ({
  page,
}) => {
  await openFixtures(page);
  // Kitchen → bedroom through r01.d2, straight on and at an angle like the G1 recording. The
  // start distances make the crossing step's previous state land 1–4 cm before the door, so
  // the in-between frames have the eye on the old side of the door.
  for (const [lateral, label] of [
    [0, 'straight'],
    [0.45, 'angled right'],
    [-0.45, 'angled left'],
  ] as const) {
    for (const extra of [0.013, 0.031, 0.047]) {
      const front = frontOf('r01', 'd2', 0.6 + extra);
      // r01.d2 is on the N wall: lateral offset along x, then aim at the door centre.
      const x = front.x + lateral;
      const z = front.z;
      await setPose(page, 'r01', x, z, yawToDoor('r01', 'd2', x, z));
      // Walk one step at a time until the step that crosses into the bedroom.
      let crossed = false;
      for (let i = 0; i < 90 && !crossed; i++) {
        await page.evaluate(() => {
          window.__ogm?.step(1, { forward: true });
        });
        crossed = (await page.evaluate(() => window.__ogm?.getState().room)) === 'r02';
      }
      expect(crossed, label).toBe(true);
      // Render the frames a 120 Hz display shows inside that step.
      const shots: ReturnType<typeof decode>[] = [];
      for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
        await page.evaluate((a) => {
          window.__ogm?.renderAt(a);
        }, alpha);
        await frames(page, 2);
        shots.push(decode(await page.screenshot()));
      }
      const changes = shots.slice(1).map((img, i) => meanAbsDiff(shots[i] ?? img, img));
      const name = `${label} +${extra.toFixed(3)}`;
      test.info().annotations.push({
        type: `in-step changes (${name})`,
        description: changes.map((c) => c.toFixed(2)).join(', '),
      });
      // A quarter step is ~1.2 cm of movement: a real change is small everywhere.
      for (const c of changes) expect(c, name).toBeLessThan(4);
    }
  }
});
