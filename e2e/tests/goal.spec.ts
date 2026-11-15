/**
 * The Offered Grade stands out (CP09 T1.5 and acceptance): in three generated houses it is the
 * brightest object seen from every door of the goal room, and through doorways at portal
 * levels 1 and 2. The screenshots are attached to the report (PR evidence).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { goalBrightness, type GoalBrightness } from './brightness.js';
import type { RoomDto } from './helpers.js';

/** Dumped levels in packages/client/src/dev/levels (`GOAL_HOUSES=a,b,c` overrides). */
const HOUSES = (process.env.GOAL_HOUSES ?? 'sample-easy,sample-medium,sample-hard').split(',');

interface DumpedLevel {
  goalRoom: string;
  /** The doors' links are one-way: the house is not Euclidean. */
  rooms: RoomDto[];
}

function level(file: string): DumpedLevel {
  const url = new URL(`../../packages/client/src/dev/levels/${file}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as DumpedLevel;
}

/** Doors (room, door) that lead into one of `targets`. */
function doorsInto(rooms: RoomDto[], targets: Set<string>): { room: string; door: string }[] {
  return rooms.flatMap((r) =>
    r.doors.flatMap((d) =>
      d.link && targets.has(d.link.room) && !targets.has(r.id) ? [{ room: r.id, door: d.id }] : [],
    ),
  );
}

/** The client's yaw convention (physics.ts `yawToward`). */
const yawToward = (fx: number, fz: number, tx: number, tz: number) =>
  Math.atan2(-(tx - fx), -(tz - fz));

async function openHouse(page: Page, file: string, room: string): Promise<void> {
  await page.goto(`/?dev=level&file=${file}&room=${room}&overlay=0&quality=high`);
  await page.waitForFunction(() => window.__ogm !== undefined, null, { timeout: 30_000 });
}

async function dto(page: Page, room: string): Promise<RoomDto> {
  const d = await page.evaluate((r) => window.__ogm?.roomDto(r), room);
  if (!d) throw new Error(`no room ${room}`);
  return d;
}

async function pose(page: Page, room: string, x: number, z: number, yaw: number): Promise<void> {
  await page.evaluate(
    ([r, px, pz, y]) => {
      window.__ogm?.setPose(r, px, pz, y, 0);
      window.__ogm?.renderAt(1);
    },
    [room, x, z, yaw] as const,
  );
}

async function attach(page: Page, info: TestInfo, name: string, b: GoalBrightness) {
  // Kept in test-results/ as well: these are the PR's screenshots.
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
  const json = info.outputPath(`${name}.json`);
  writeFileSync(json, JSON.stringify(b, null, 2));
  await info.attach(`${name}.json`, { path: json, contentType: 'application/json' });
}

/**
 * The screen is 8-bit: lamps and the goal's core both clip to white, and blocks that are
 * both saturated differ by a few levels of noise. Within this they count as equally bright.
 */
const SATURATION_TIE = 3;

const isBrightest = (b: GoalBrightness) => b.goal >= b.other - SATURATION_TIE && b.goal > 245;

function expectBrightest(b: GoalBrightness | null, where: string): asserts b is GoalBrightness {
  expect(b, `${where}: goal not in view`).not.toBeNull();
  if (!b) return;
  expect(
    b.goal,
    `${where}: an object at (${String(b.otherAt.x)}, ${String(b.otherAt.y)}) is brighter`,
  ).toBeGreaterThanOrEqual(b.other - SATURATION_TIE);
  expect(b.goal, `${where}: the goal is not glowing`).toBeGreaterThan(245);
}

/** A spot with a view of the goal: stand at (x, z) in `room` facing `yaw`. */
interface View {
  file: string;
  level: number;
  room: string;
  door: string;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Searches spots in `room` around its door `door` (`dists` into the room, `sides` along the
 * wall), aims at the goal (level 0) or its image behind the door, and returns the first spot
 * where the whole diploma is seen at portal `level` and the goal is the brightest object.
 */
async function findView(
  page: Page,
  file: string,
  room: string,
  door: string,
  level: number,
  dists: number[],
  sides: number[],
): Promise<{ view: View; brightness: GoalBrightness } | null> {
  const { width, depth } = await dto(page, room);
  const at = (dist: number) =>
    page.evaluate(([r, d, s]) => window.__ogm?.doorPose(r, d, s) ?? null, [
      room,
      door,
      dist,
    ] as const);
  const near = await at(1);
  const far = await at(2);
  if (!near || !far) return null;
  // Into the room and along the door's wall.
  const [ix, iz] = [far.x - near.x, far.z - near.z];
  for (const dist of dists) {
    for (const side of sides) {
      const x = near.x + ix * (dist - 1) - iz * side;
      const z = near.z + iz * (dist - 1) + ix * side;
      if (Math.abs(x) > width / 2 - 0.3 || Math.abs(z) > depth / 2 - 0.3) continue;
      // One physics step pushes the player out of any furniture the spot is in.
      const src = await page.evaluate(
        ([r, px, pz, yaw]) => {
          const hook = window.__ogm;
          if (!hook) return null;
          hook.setPose(r, px, pz, yaw, 0);
          hook.step(1);
          const s = hook.getState();
          const g = s.room === r ? hook.goalSource() : null;
          return g ? { ...g, px: s.x, pz: s.z } : null;
        },
        [room, x, z, yawToward(x, z, near.x - ix, near.z - iz)] as const,
      );
      if (src?.level !== level) continue;
      const view = {
        file,
        level,
        room,
        door,
        x: round(src.px),
        z: round(src.pz),
        yaw: round(yawToward(src.px, src.pz, src.x, src.z)),
      };
      const brightness = await measure(page, view);
      if (brightness && isBrightest(brightness)) return { view, brightness };
    }
  }
  return null;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Stands at `view` and measures; null if the goal is not (wholly) in view at its level. */
async function measure(page: Page, view: View): Promise<GoalBrightness | null> {
  await pose(page, view.room, view.x, view.z, view.yaw);
  const b = await goalBrightness(page);
  return b && b.screen.level === view.level ? b : null;
}

/** Spots along the wall and into the room for the searches. */
const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => round(from + i * step));
const NEAR_DOOR = { dists: [0.6, 1], sides: [0, -0.4, 0.4, -0.8, 0.8] };
const AROUND_DOOR = {
  dists: range(0.6, 6, 0.4),
  sides: [0, ...range(0.3, 2.4, 0.3).flatMap((v) => [-v, v])],
};

for (const file of HOUSES) {
  const goalRoom = level(file).goalRoom;
  test(`${file}: the goal is the brightest object from every door of its room`, async ({
    page,
  }, info) => {
    await openHouse(page, file, goalRoom);
    const room = await dto(page, goalRoom);
    for (const door of room.doors) {
      // Just inside the doorway, looking at the goal.
      const found = await findView(
        page,
        file,
        goalRoom,
        door.id,
        0,
        NEAR_DOOR.dists,
        NEAR_DOOR.sides,
      );
      if (found) await attach(page, info, `${file}-${door.id}`, found.brightness);
      expect(
        found,
        `${goalRoom}.${door.id}: no spot near the door sees the goal brightest`,
      ).not.toBeNull();
    }
  });
}

/**
 * Spots that see the whole diploma through one and two doorways (portal levels 1 and 2). Level 1
 * views exist in every house searched (27); level 2 views only in 2 of 27, because furniture
 * or misaligned doors block the line through two doorways (ADR-0010). Found with
 * `GOAL_SEARCH=1` (see below).
 */
const VIEWS: View[] = [
  { file: 'sample-hard', level: 1, room: 'r00', door: 'd2', x: 1.5, z: -3.8, yaw: 0.261 },
  { file: 'view-M1-0000-0007', level: 1, room: 'r06', door: 'd0', x: -0.75, z: 1.55, yaw: -2.843 },
  { file: 'view-M1-0000-0007', level: 2, room: 'r08', door: 'd2', x: -0.4, z: 1.95, yaw: -1.956 },
  { file: 'view-M1-0000-0002', level: 1, room: 'r03', door: 'd0', x: 1.5, z: -2.05, yaw: -0.157 },
  { file: 'view-M1-0000-0002', level: 2, room: 'r12', door: 'd0', x: -2.1, z: -3.5, yaw: 1.41 },
];

for (const view of VIEWS) {
  test(`${view.file}: the goal is recognisable and brightest at portal level ${String(view.level)} from ${view.room}`, async ({
    page,
  }, info) => {
    await openHouse(page, view.file, level(view.file).goalRoom);
    const b = await measure(page, view);
    if (b) await attach(page, info, `${view.file}-level${String(view.level)}-${view.room}`, b);
    expectBrightest(b, `${view.room} (level ${String(view.level)})`);
  });
}

/**
 * `GOAL_SEARCH=1 GOAL_HOUSES=a,b pnpm test:e2e goal -g search` searches the houses for level 1
 * and level 2 views and prints them for {@link VIEWS}.
 */
test('search for portal views of the goal', async ({ page }) => {
  test.skip(process.env.GOAL_SEARCH !== '1', 'set GOAL_SEARCH=1');
  test.setTimeout(3_600_000);
  for (const file of HOUSES) {
    const { goalRoom, rooms } = level(file);
    await openHouse(page, file, goalRoom);
    const into1 = doorsInto(rooms, new Set([goalRoom]));
    const into2 = doorsInto(rooms, new Set([goalRoom, ...into1.map((d) => d.room)]));
    for (const [lvl, doors] of [
      [1, into1],
      [2, into2],
    ] as const) {
      let found: View | null = null;
      for (const d of doors) {
        const f = await findView(
          page,
          file,
          d.room,
          d.door,
          lvl,
          AROUND_DOOR.dists,
          AROUND_DOOR.sides,
        );
        if (f) {
          found = f.view;
          break;
        }
      }
      console.log(`VIEW ${file} level ${String(lvl)}: ${found ? JSON.stringify(found) : 'none'}`);
      if (!found) break;
    }
  }
});

test('bob, rotation and glow are identical in the main view and through a portal', async ({
  page,
}, info) => {
  const view = VIEWS.find((v) => v.level === 1);
  if (!view) throw new Error('no level-1 view in VIEWS');
  const goalRoom = level(view.file).goalRoom;
  await openHouse(page, view.file, goalRoom);
  expect(await measure(page, view)).not.toBeNull();
  const door = { room: view.room, door: view.door };
  // Mid-bob and turned: t = 1.3 s.
  await page.evaluate(() => {
    window.__ogm?.setAmbientTime(1.3);
  });
  const check = await page.evaluate((d) => window.__ogm?.portalCheck(d), door.door);
  expect(check?.pixels).toBeGreaterThan(2000);
  expect(check?.meanDiff, 'portal image vs direct render of the goal room').toBeLessThan(2.5);
  const through = info.outputPath('pair-1-through-portal.png');
  await page.screenshot({ path: through });
  await info.attach('through the portal (t = 1.3 s)', { path: through, contentType: 'image/png' });

  // Walk through the door: the same goal at the same time, now in the main view.
  for (let i = 0; i < 40; i++) {
    const room = await page.evaluate(() => {
      window.__ogm?.step(5, { forward: true });
      return window.__ogm?.getState().room;
    });
    if (room === goalRoom) break;
  }
  expect(await page.evaluate(() => window.__ogm?.getState().room)).toBe(goalRoom);
  await page.evaluate(() => {
    window.__ogm?.setAmbientTime(1.3);
  });
  expect(await page.evaluate(() => window.__ogm?.goalScreen()?.level)).toBe(0);
  const main = info.outputPath('pair-2-main-view.png');
  await page.screenshot({ path: main });
  await info.attach('main view (t = 1.3 s)', { path: main, contentType: 'image/png' });
  test.info().annotations.push({
    type: 'portal mean diff /255',
    description: `${door.room}.${door.door}: ${check?.meanDiff.toFixed(3) ?? '?'} (${String(check?.pixels ?? 0)} px)`,
  });
});
