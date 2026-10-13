import { describe, expect, it } from 'vitest';
import { PerfLog, type PerfFrame } from './PerfLog.js';

const frame = (p: Partial<PerfFrame> = {}): PerfFrame => ({
  frameMs: 1000 / 120,
  passes: 4,
  renderCompiles: 0,
  room: 'r00',
  missingPortalTargets: 0,
  ...p,
});

describe('PerfLog (CP10 B1)', () => {
  it('summarises frame times and passes against the targets', () => {
    const log = new PerfLog();
    for (let i = 0; i < 95; i++) log.record(frame());
    for (let i = 0; i < 5; i++) log.record(frame({ frameMs: 20, passes: 9 }));
    const s = log.summary();
    expect(s.frames).toBe(100);
    expect(s.avgFps).toBeGreaterThan(100);
    expect(s.p95Ms).toBeCloseTo(1000 / 120, 6);
    expect(s.maxMs).toBe(20);
    expect(s.maxPasses).toBe(9);
    expect(s.targets).toEqual({
      avgFps: true,
      p95: true,
      passes: true,
      missingPortalTargets: true,
      lateCompiles: true,
    });
    log.record(frame({ frameMs: 30 }));
    for (let i = 0; i < 10; i++) log.record(frame({ frameMs: 30 }));
    expect(log.summary().targets.p95).toBe(false);
  });

  it('render-time shader compiles are tolerated on a first visit, reported in a room visited before', () => {
    const log = new PerfLog();
    log.record(frame({ room: 'r00', renderCompiles: 0 }));
    log.record(frame({ room: 'r01', renderCompiles: 2 })); // first visit of r01: tolerated
    log.record(frame({ room: 'r00', renderCompiles: 2 }));
    log.record(frame({ room: 'r00', renderCompiles: 3 })); // in r00 again: late
    const s = log.summary();
    expect(s.lateCompiles).toEqual([
      { atSeconds: expect.any(Number) as number, room: 'r00', compiles: 3 },
    ]);
    expect(s.renderCompiles).toBe(3);
    expect(s.targets.lateCompiles).toBe(false);
    expect(s.roomsVisited).toBe(2);
  });

  it('counts missing portal targets across games (the engine restarts its counter) and skips long gaps', () => {
    const log = new PerfLog();
    log.record(frame({ missingPortalTargets: 0 }));
    log.record(frame({ missingPortalTargets: 2 }));
    log.record(frame({ missingPortalTargets: 0 })); // new game
    log.record(frame({ missingPortalTargets: 1 }));
    log.record(frame({ frameMs: 5000 }));
    const s = log.summary();
    expect(s.missingPortalTargets).toBe(3);
    expect(s.frames).toBe(4);
    log.reset();
    expect(log.summary().frames).toBe(0);
  });
});
