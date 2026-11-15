import { generateLevel, GenerationError } from '@ogm/generator';
import { describe, expect, it } from 'vitest';
import { InvalidLevelError, LevelCache } from './LevelCache.js';
import { neighbourhood } from './neighbourhood.js';

/** A small graph: r00 → r01 → r02 → r03, r01 → r00 (back), r04 unreachable, r03 sealed. */
const graph = {
  rooms: [
    { id: 'r00', doors: [{ id: 'd0', link: { room: 'r01', door: 'd0' } }] },
    {
      id: 'r01',
      doors: [
        { id: 'd0', link: { room: 'r00', door: 'd0' } },
        { id: 'd1', link: { room: 'r02', door: 'd0' } },
      ],
    },
    { id: 'r02', doors: [{ id: 'd0', link: { room: 'r03', door: 'd0' } }] },
    { id: 'r03', doors: [{ id: 'd0', link: null }] },
    { id: 'r04', doors: [{ id: 'd0', link: { room: 'r00', door: 'd0' } }] },
  ],
};

describe('neighbourhood (CP07 T3)', () => {
  it('follows outgoing links within the radius, includes the room, sorts by id', () => {
    expect(neighbourhood(graph, 'r00', 0)).toEqual(['r00']);
    expect(neighbourhood(graph, 'r00', 1)).toEqual(['r00', 'r01']);
    expect(neighbourhood(graph, 'r00', 2)).toEqual(['r00', 'r01', 'r02']);
    expect(neighbourhood(graph, 'r00', 4)).toEqual(['r00', 'r01', 'r02', 'r03']);
    // Incoming links do not count: nothing links r03 onwards, r04 links in only.
    expect(neighbourhood(graph, 'r03', 4)).toEqual(['r03']);
    expect(neighbourhood(graph, 'r04', 1)).toEqual(['r00', 'r04']);
    expect(neighbourhood(graph, 'r99', 4)).toEqual([]);
  });

  it('on a generated house: every room within 4 hops of the start', () => {
    const level = generateLevel('H1-7K2Q-X9MP');
    const near = neighbourhood(level, level.startRoom, 4);
    expect(near).toContain(level.startRoom);
    expect(near.length).toBeLessThanOrEqual(level.rooms.length);
    expect(neighbourhood(level, level.startRoom, 30)).toHaveLength(level.rooms.length);
  });
});

describe('LevelCache (CP07 T3)', () => {
  it('generates on a miss, serves hits, evicts the least recently used', () => {
    let generated = 0;
    const cache = new LevelCache(2, (seed) => {
      generated++;
      return generateLevel(seed);
    });
    const a = cache.get('E1-0000-0001');
    expect(a.hit).toBe(false);
    expect(cache.get('E1-0000-0001')).toMatchObject({ hit: true, generationMs: 0 });
    cache.get('E1-0000-0002');
    cache.get('E1-0000-0001'); // refresh: 0002 is now the oldest
    cache.get('E1-0000-0003'); // evicts 0002
    expect(cache.size).toBe(2);
    expect(generated).toBe(3);
    expect(cache.get('E1-0000-0001').hit).toBe(true);
    expect(cache.get('E1-0000-0002').hit).toBe(false);
  });

  it('never caches or serves an invalid level; generation errors pass through', () => {
    const invalid = new LevelCache(
      2,
      (seed) => generateLevel(seed),
      () => [{ check: 'V1', message: 'broken' }],
    );
    expect(() => invalid.get('E1-0000-0001')).toThrow(InvalidLevelError);
    expect(invalid.size).toBe(0);
    const failing = new LevelCache(2, (seed) => {
      throw new GenerationError(seed, ['x']);
    });
    expect(() => failing.get('E1-0000-0001')).toThrow(GenerationError);
  });
});
