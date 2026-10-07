/**
 * Automatic portal quality (CP03 T6).
 *
 * With `auto`, a 2-second average frame time above 20 ms steps quality down one level:
 * MSAA off → level-1 scale 0.75 → max depth 2. After 10 s below 12 ms it steps back up one
 * level. `high` and `low` pin the top and bottom levels (the settings UI arrives in CP09).
 */
import type { PortalSettings } from '../portals/PortalRenderer.js';

export type QualityMode = 'auto' | 'high' | 'low';

type QualityLevel = Pick<PortalSettings, 'msaa' | 'level1Scale' | 'maxDepth'>;

/** Quality levels, best first. */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { msaa: true, level1Scale: 1, maxDepth: 3 },
  { msaa: false, level1Scale: 1, maxDepth: 3 },
  { msaa: false, level1Scale: 0.75, maxDepth: 3 },
  { msaa: false, level1Scale: 0.75, maxDepth: 2 },
];

/** Step down when the 2 s average frame time exceeds this (ms). */
export const STEP_DOWN_MS = 20;
/** Step up after the average stays below this (ms)… */
export const STEP_UP_MS = 12;
/** …for this long (ms). */
export const STEP_UP_AFTER_MS = 10_000;
/** Wait after a change so the 2 s averaging window refills before judging again (ms). */
export const SETTLE_MS = 2_000;

export class QualityManager {
  private levelIndex = 0;
  private modeValue: QualityMode;
  private lastChangeAt = -Infinity;
  private fastSince: number | null = null;

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
      QUALITY_LEVELS[0] ?? { msaa: true, level1Scale: 1, maxDepth: 3 }
    );
  }

  /** Switches mode. `high`/`low` pin the level; `auto` restarts from the best level. */
  setMode(mode: QualityMode, nowMs = 0): void {
    this.modeValue = mode;
    this.levelIndex = mode === 'low' ? QUALITY_LEVELS.length - 1 : 0;
    this.lastChangeAt = nowMs;
    this.fastSince = null;
  }

  /**
   * Feeds the current 2-second average frame time. Returns true if the level changed.
   */
  update(nowMs: number, avgFrameMs: number): boolean {
    if (this.modeValue !== 'auto' || avgFrameMs <= 0) return false;
    if (this.lastChangeAt === -Infinity) {
      // First sample: let the averaging window fill before judging.
      this.lastChangeAt = nowMs;
      return false;
    }
    // Track how long frames have been fast, even while settling.
    if (avgFrameMs < STEP_UP_MS) this.fastSince ??= nowMs;
    else this.fastSince = null;
    if (nowMs - this.lastChangeAt < SETTLE_MS) return false;

    if (avgFrameMs > STEP_DOWN_MS && this.levelIndex < QUALITY_LEVELS.length - 1) {
      this.levelIndex++;
      this.lastChangeAt = nowMs;
      return true;
    }
    if (
      this.fastSince !== null &&
      nowMs - this.fastSince >= STEP_UP_AFTER_MS &&
      this.levelIndex > 0
    ) {
      this.levelIndex--;
      this.lastChangeAt = nowMs;
      this.fastSince = null;
      return true;
    }
    return false;
  }
}
