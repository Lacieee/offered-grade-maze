/**
 * Automatic portal quality (CP03 T6).
 *
 * With `auto`, a 2-second average frame time above 20 ms steps quality down one level:
 * MSAA off → level-1 scale 0.75 → level-1 scale 0.6 and deeper levels at 0.6 of their size.
 * After 10 s of fast frames it steps back up one level. Automatic quality never lowers the
 * portal depth (CP06 review: a missing third room is the most visible saving there is, and it
 * saves little, since deep portals are small and scissored). `high` pins the best level;
 * `low` pins depth 2 (the settings UI arrives in CP09).
 *
 * "Fast" is below 12 ms, or (CP06 review) within 10 % of the display's refresh interval: a
 * 60 Hz display never shows frames below 16.7 ms, so quality used to stay low for good after
 * one slow spell. A step up that does not hold (back down within 6 s) doubles the wait before
 * the next try, up to 80 s. A pause (hidden tab, long hitch) restarts the 2 s judging window.
 */
import type { PortalSettings } from '../portals/PortalRenderer.js';

export type QualityMode = 'auto' | 'high' | 'low';

type QualityLevel = Pick<PortalSettings, 'msaa' | 'level1Scale' | 'deepScale' | 'maxDepth'>;

/** Quality levels, best first: the automatic ones, then Low. */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { msaa: true, level1Scale: 1, deepScale: 1, maxDepth: 3 },
  { msaa: false, level1Scale: 1, deepScale: 1, maxDepth: 3 },
  { msaa: false, level1Scale: 0.75, deepScale: 1, maxDepth: 3 },
  { msaa: false, level1Scale: 0.6, deepScale: 0.6, maxDepth: 3 },
  // Low (pinned only).
  { msaa: false, level1Scale: 0.6, deepScale: 0.6, maxDepth: 2 },
];

/** Levels automatic quality moves between (all but Low). */
export const AUTO_LEVELS = QUALITY_LEVELS.length - 1;

/** Step down when the 2 s average frame time exceeds this (ms). */
export const STEP_DOWN_MS = 20;
/** Step up after the average stays below this (ms)… */
export const STEP_UP_MS = 12;
/** …for this long (ms). */
export const STEP_UP_AFTER_MS = 10_000;
/** Wait after a change so the 2 s averaging window refills before judging again (ms). */
export const SETTLE_MS = 2_000;
/** Frames within this factor of the display refresh interval count as fast. */
export const REFRESH_SLACK = 1.1;
/** A step down this soon after a step up means the step up did not hold (ms). */
export const FAILED_STEP_UP_MS = 6_000;
/** Longest wait before stepping up after failed tries (ms). */
export const MAX_STEP_UP_AFTER_MS = 80_000;

export class QualityManager {
  private levelIndex = 0;
  private modeValue: QualityMode;
  private lastChangeAt = -Infinity;
  private fastSince: number | null = null;
  private stepUpAfter = STEP_UP_AFTER_MS;
  private lastStepUpAt = -Infinity;

  constructor(mode: QualityMode = 'auto') {
    this.modeValue = mode;
    this.levelIndex = mode === 'low' ? QUALITY_LEVELS.length - 1 : 0;
  }

  get mode(): QualityMode {
    return this.modeValue;
  }

  /** Current level index: 0 = best. */
  get level(): number {
    return this.levelIndex;
  }

  /** Settings for the current level. */
  get settings(): QualityLevel {
    return (
      QUALITY_LEVELS[this.levelIndex] ??
      QUALITY_LEVELS[0] ?? { msaa: true, level1Scale: 1, deepScale: 1, maxDepth: 3 }
    );
  }

  /** Switches mode. `high`/`low` pin the level; `auto` restarts from the best level. */
  setMode(mode: QualityMode, nowMs = 0): void {
    this.modeValue = mode;
    this.levelIndex = mode === 'low' ? QUALITY_LEVELS.length - 1 : 0;
    this.lastChangeAt = nowMs;
    this.fastSince = null;
    this.stepUpAfter = STEP_UP_AFTER_MS;
    this.lastStepUpAt = -Infinity;
  }

  /**
   * The loop was paused (hidden tab, window switch, a long hitch): judge again only once the
   * 2 s window holds fresh frames. Call it together with resetting the frame statistics.
   */
  pause(nowMs: number): void {
    if (this.lastChangeAt !== -Infinity) this.lastChangeAt = Math.max(this.lastChangeAt, nowMs);
    this.fastSince = null;
  }

  /**
   * Feeds the current 2-second average frame time and, if known, the display refresh interval
   * (both ms). Returns true if the level changed.
   */
  update(nowMs: number, avgFrameMs: number, refreshMs = 0): boolean {
    if (this.modeValue !== 'auto' || avgFrameMs <= 0) return false;
    if (this.lastChangeAt === -Infinity) {
      // First sample: let the averaging window fill before judging.
      this.lastChangeAt = nowMs;
      return false;
    }
    // Track how long frames have been fast, even while settling.
    const fast = avgFrameMs < Math.max(STEP_UP_MS, refreshMs * REFRESH_SLACK);
    if (fast) this.fastSince ??= nowMs;
    else this.fastSince = null;
    if (nowMs - this.lastChangeAt < SETTLE_MS) return false;

    if (avgFrameMs > STEP_DOWN_MS && this.levelIndex < AUTO_LEVELS - 1) {
      this.levelIndex++;
      if (nowMs - this.lastStepUpAt <= FAILED_STEP_UP_MS) {
        this.stepUpAfter = Math.min(this.stepUpAfter * 2, MAX_STEP_UP_AFTER_MS);
      }
      this.lastChangeAt = nowMs;
      return true;
    }
    if (
      this.fastSince !== null &&
      nowMs - this.fastSince >= this.stepUpAfter &&
      this.levelIndex > 0
    ) {
      this.levelIndex--;
      this.lastChangeAt = nowMs;
      this.lastStepUpAt = nowMs;
      this.fastSince = null;
      return true;
    }
    return false;
  }
}
