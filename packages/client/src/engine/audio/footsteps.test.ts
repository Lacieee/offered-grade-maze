import { describe, expect, it } from 'vitest';
import { FIRST_STEP_M, FootstepTracker, STEP_M } from './footsteps.js';

/** Walks `metres` at `speed` in 1/60 s steps; returns the distances at which steps fell. */
function walk(t: FootstepTracker, metres: number, speed = 3, from = 0): number[] {
  const dt = 1 / 60;
  const steps: number[] = [];
  let d = from;
  while (d < from + metres - 1e-9) {
    const dist = Math.min(speed * dt, from + metres - d);
    d += dist;
    if (t.advance(dist, speed) !== null) steps.push(d);
  }
  return steps;
}

describe('FootstepTracker (CP09 T3)', () => {
  it('first step at 0.15 m, then every 1.3 m (±one simulation step)', () => {
    const t = new FootstepTracker();
    const steps = walk(t, 10);
    const tol = 3 / 60;
    expect(steps[0]).toBeGreaterThanOrEqual(FIRST_STEP_M);
    expect((steps[0] ?? 0) - FIRST_STEP_M).toBeLessThanOrEqual(tol);
    for (let i = 1; i < steps.length; i++) {
      expect((steps[i] ?? 0) - (steps[i - 1] ?? 0)).toBeCloseTo(STEP_M, 1);
    }
    expect(steps).toHaveLength(Math.floor((10 - FIRST_STEP_M) / STEP_M) + 1);
  });

  it('alternates left and right', () => {
    const t = new FootstepTracker();
    const sides: string[] = [];
    for (let i = 0; i < 400; i++) {
      const s = t.advance(0.05, 3);
      if (s) sides.push(s);
    }
    expect(sides.slice(0, 4)).toEqual(['L', 'R', 'L', 'R']);
  });

  it('no steps when stationary or slower than 0.3 m/s', () => {
    const t = new FootstepTracker();
    for (let i = 0; i < 600; i++) expect(t.advance(0, 0)).toBeNull();
    expect(walk(t, 5, 0.25)).toEqual([]);
  });

  it('stops with the player: no step after stopping, the next walk starts with 0.15 m', () => {
    const t = new FootstepTracker();
    walk(t, 2);
    for (let i = 0; i < 120; i++) expect(t.advance(0.001, 0.05)).toBeNull();
    const again = walk(t, 1);
    expect(again[0]).toBeCloseTo(FIRST_STEP_M, 1);
  });

  it('head bob is 0 at a step, about −1 cm half way, and 0 while standing', () => {
    const t = new FootstepTracker();
    walk(t, FIRST_STEP_M + STEP_M / 2);
    expect(t.bobOffset()).toBeCloseTo(-0.01, 3);
    t.advance(0, 0);
    expect(t.bobOffset()).toBe(0);
  });
});
