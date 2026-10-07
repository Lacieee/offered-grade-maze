import { describe, expect, it } from 'vitest';
import { PerfStats } from './PerfStats.js';

const render = { drawCalls: 12, triangles: 900, passes: 1 };

describe('PerfStats', () => {
  it('is empty before any frame', () => {
    expect(new PerfStats().summary()).toMatchObject({ fps: 0, avgMs: 0, p95Ms: 0 });
  });

  it('reports fps, average and p95 over the window', () => {
    const stats = new PerfStats(2000);
    let t = 0;
    for (let i = 0; i < 100; i++) {
      const ms = i < 95 ? 10 : 40; // 5 % slow frames
      t += ms;
      stats.record(t, ms, render);
    }
    const s = stats.summary();
    expect(s.avgMs).toBeCloseTo((95 * 10 + 5 * 40) / 100);
    expect(s.p95Ms).toBe(10);
    expect(s.fps).toBeCloseTo(1000 / s.avgMs);
    expect(s).toMatchObject(render);
  });

  it('forgets frames older than the window', () => {
    const stats = new PerfStats(2000);
    stats.record(0, 50, render);
    stats.record(3000, 16, render);
    expect(stats.summary().avgMs).toBe(16);
  });
});
