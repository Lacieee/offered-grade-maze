/**
 * Footstep timing (CP09 T3), by distance walked: the first step after 0.15 m, then one every
 * 1.3 m; nothing while slower than 0.3 m/s. Pure, so the cadence is unit-tested.
 */

/** Distance to the first step after starting to move (m). */
export const FIRST_STEP_M = 0.15;
/** Distance between steps (m). */
export const STEP_M = 1.3;
/** Below this speed no step is taken (m/s). */
export const MIN_STEP_SPEED = 0.3;

export type Side = 'L' | 'R';

export class FootstepTracker {
  private untilNext = FIRST_STEP_M;
  private moving = false;
  private nextSide: Side = 'L';
  /** Distance walked since moving (m), for the head bob. */
  private walked = 0;

  /**
   * Advances by `distance` metres walked at `speed` m/s. Returns the side of the step taken,
   * or null (at most one step per call: calls are per 1/60 s simulation step).
   */
  advance(distance: number, speed: number): Side | null {
    if (speed < MIN_STEP_SPEED) {
      // Stopped: the next walk starts with a short first step again.
      this.moving = false;
      this.untilNext = FIRST_STEP_M;
      return null;
    }
    this.moving = true;
    this.walked += distance;
    this.untilNext -= distance;
    if (this.untilNext > 0) return null;
    this.untilNext += STEP_M;
    const side = this.nextSide;
    this.nextSide = side === 'L' ? 'R' : 'L';
    return side;
  }

  /** True while walking at step speed. */
  get isMoving(): boolean {
    return this.moving;
  }

  /**
   * Head-bob offset (m): 0 at each step, dipping 1 cm half way, only while moving (CP09 T3.5).
   */
  bobOffset(amplitude = 0.01): number {
    if (!this.moving) return 0;
    const phase = 1 - this.untilNext / STEP_M; // 0 … 1 between steps
    return -amplitude * Math.sin(Math.PI * Math.min(1, Math.max(0, phase)));
  }

  /** Distance walked while moving (m). */
  get distance(): number {
    return this.walked;
  }

  reset(): void {
    this.untilNext = FIRST_STEP_M;
    this.moving = false;
    this.walked = 0;
    this.nextSide = 'L';
  }
}
