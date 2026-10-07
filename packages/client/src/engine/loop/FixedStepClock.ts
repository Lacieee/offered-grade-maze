/** Simulation step: 1/60 s. */
export const SIM_STEP = 1 / 60;

/** Longest frame delta that is simulated; longer gaps (tab switch, debugger) are clamped. */
export const MAX_FRAME_DELTA = 0.25;

/** Result of advancing the clock by one rendered frame. */
export interface ClockAdvance {
  /** Number of fixed simulation steps to run this frame. */
  steps: number;
  /** Interpolation factor between the previous and current simulation state, in [0, 1). */
  alpha: number;
}

/**
 * Fixed-step accumulator. Each rendered frame adds its (clamped) delta and runs as many whole
 * {@link SIM_STEP}s as fit; the remainder becomes the render interpolation factor.
 */
export class FixedStepClock {
  private accumulator = 0;

  /** Advances by `deltaSeconds` (clamped to [0, {@link MAX_FRAME_DELTA}]). */
  advance(deltaSeconds: number): ClockAdvance {
    const dt = Number.isFinite(deltaSeconds)
      ? Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_DELTA)
      : 0;
    this.accumulator += dt;
    let steps = 0;
    // Small tolerance so 1/60 s frames do not alternate between 0 and 2 steps.
    while (this.accumulator >= SIM_STEP - 1e-9) {
      this.accumulator = Math.max(0, this.accumulator - SIM_STEP);
      steps++;
    }
    return { steps, alpha: this.accumulator / SIM_STEP };
  }

  /** Drops any accumulated time (used after teleports and when the loop restarts). */
  reset(): void {
    this.accumulator = 0;
  }
}
