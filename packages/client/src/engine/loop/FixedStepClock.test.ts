import { describe, expect, it } from 'vitest';
import { FixedStepClock, MAX_FRAME_DELTA, SIM_STEP } from './FixedStepClock.js';

describe('FixedStepClock', () => {
  it('runs exactly one step per 60 Hz frame', () => {
    const clock = new FixedStepClock();
    for (let i = 0; i < 600; i++) expect(clock.advance(1 / 60).steps).toBe(1);
  });

  it('accumulates short frames and reports the interpolation factor', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(1 / 120)).toEqual({ steps: 0, alpha: expect.closeTo(0.5, 9) as number });
    expect(clock.advance(1 / 120).steps).toBe(1);
    const r = clock.advance(SIM_STEP * 2.25);
    expect(r.steps).toBe(2);
    expect(r.alpha).toBeCloseTo(0.25, 6);
  });

  it('clamps long and invalid deltas', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(5).steps).toBe(Math.floor(MAX_FRAME_DELTA / SIM_STEP + 1e-6));
    clock.reset();
    expect(clock.advance(-1)).toEqual({ steps: 0, alpha: 0 });
    expect(clock.advance(Number.NaN)).toEqual({ steps: 0, alpha: 0 });
  });
});
