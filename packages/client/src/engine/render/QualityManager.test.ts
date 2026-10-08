import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, QualityManager } from './QualityManager.js';

/** Feeds a constant frame time every 100 ms for `seconds` (with a display refresh interval). */
function run(q: QualityManager, from: number, seconds: number, avg: number, refresh = 0): number {
  let t = from;
  for (let i = 0; i < seconds * 10; i++) {
    t += 100;
    q.update(t, avg, refresh);
  }
  return t;
}

describe('QualityManager', () => {
  it('steps down in order: MSAA off, level-1 scale 0.75, depth 2', () => {
    const q = new QualityManager('auto');
    expect(q.settings).toEqual({ msaa: true, level1Scale: 1, maxDepth: 3 });
    let t = run(q, 0, 2.5, 30);
    expect(q.settings).toEqual({ msaa: false, level1Scale: 1, maxDepth: 3 });
    t = run(q, t, 2.1, 30);
    expect(q.settings).toEqual({ msaa: false, level1Scale: 0.75, maxDepth: 3 });
    t = run(q, t, 2.1, 30);
    expect(q.settings).toEqual({ msaa: false, level1Scale: 0.75, maxDepth: 2 });
    run(q, t, 10, 30);
    expect(q.level).toBe(QUALITY_LEVELS.length - 1);
  });

  it('waits 2 s after a change before judging again', () => {
    const q = new QualityManager('auto');
    expect(q.update(100, 30)).toBe(false); // first sample starts the window
    expect(q.update(1000, 30)).toBe(false);
    expect(q.update(2200, 30)).toBe(true);
    expect(q.update(3000, 30)).toBe(false);
    expect(q.update(4300, 30)).toBe(true);
  });

  it('steps back up one level after 10 s below 12 ms', () => {
    const q = new QualityManager('auto');
    let t = run(q, 0, 4.5, 30);
    expect(q.level).toBe(2);
    t = run(q, t, 9, 8);
    expect(q.level).toBe(2);
    t = run(q, t, 2, 8);
    expect(q.level).toBe(1);
    // In between 12 and 20 ms nothing changes.
    run(q, t, 30, 15);
    expect(q.level).toBe(1);
  });

  it('pins the level in high and low mode', () => {
    const high = new QualityManager('high');
    run(high, 0, 20, 50);
    expect(high.level).toBe(0);
    const low = new QualityManager('low');
    run(low, 0, 20, 5);
    expect(low.settings.maxDepth).toBe(2);
    low.setMode('auto');
    expect(low.level).toBe(0);
  });

  // CP06 review: a room three doors away showed its fallback colour on a Mac, because
  // quality had stepped down to depth 2 and never came back.
  it('steps back up on a 60 Hz display, where frames never get below 16.7 ms', () => {
    const q = new QualityManager('auto');
    let t = run(q, 0, 7, 30);
    expect(q.settings.maxDepth).toBe(2);
    // Steady 60 fps: every frame makes the refresh.
    t = run(q, t, 10.5, 16.7, 16.7);
    expect(q.level).toBe(2);
    run(q, t, 30, 16.7, 16.7);
    expect(q.level).toBe(0);
  });

  it('does not step up while frames miss the refresh', () => {
    const q = new QualityManager('auto');
    let t = run(q, 0, 2.5, 30);
    t = run(q, t, 30, 19, 16.7);
    expect(q.level).toBe(1);
    // 120 Hz display at 10 ms: below 12 ms counts as fast, as before.
    run(q, t, 10.5, 10, 8.3);
    expect(q.level).toBe(0);
  });

  it('a pause (hidden tab, window switch, long hitch) restarts judging instead of stepping down', () => {
    const q = new QualityManager('auto');
    run(q, 0, 3, 10);
    q.pause(3000);
    // The 2 s window still holds the pause: nothing changes until it has refilled.
    expect(q.update(3100, 400)).toBe(false);
    expect(q.update(4900, 400)).toBe(false);
    expect(q.level).toBe(0);
  });

  it('waits longer before trying again after a step up that did not hold', () => {
    const q = new QualityManager('auto');
    let t = run(q, 0, 2.5, 30, 16.7);
    expect(q.level).toBe(1);
    t = run(q, t, 10.1, 16.7, 16.7);
    expect(q.level).toBe(0);
    // Best quality is too slow: back down…
    t = run(q, t, 2.5, 25, 16.7);
    expect(q.level).toBe(1);
    // …and the next try waits twice as long (20 s).
    t = run(q, t, 15, 16.7, 16.7);
    expect(q.level).toBe(1);
    run(q, t, 6, 16.7, 16.7);
    expect(q.level).toBe(0);
  });
});
