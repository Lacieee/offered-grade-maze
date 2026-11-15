import { describe, expect, it } from 'vitest';
import { FIXTURE_ROOMS } from '../../dev/fixtures/index.js';
import { World } from './World.js';

describe('World.enterableTarget', () => {
  it('returns the arrival door of a link into a loaded room', () => {
    const world = new World();
    world.load(FIXTURE_ROOMS);
    expect(world.enterableTarget({ room: 'r01', door: 'd0' })?.link).toEqual({
      room: 'r00',
      door: 'd0',
    });
    world.dispose();
  });

  it('refuses sealed arrival doors (PD9), unloaded rooms and missing links', () => {
    const world = new World();
    world.load(FIXTURE_ROOMS.filter((r) => r.id !== 'r05'));
    expect(world.enterableTarget({ room: 'r01', door: 'd3' })).toBeUndefined(); // sealed
    expect(world.enterableTarget({ room: 'r05', door: 'd0' })).toBeUndefined(); // not loaded
    expect(world.enterableTarget({ room: 'r01', door: 'd9' })).toBeUndefined(); // no such door
    expect(world.enterableTarget(null)).toBeUndefined();
    world.dispose();
  });
});
