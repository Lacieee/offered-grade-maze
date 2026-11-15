/**
 * Performance log for the CP10 B1 walk (`?perf=1`): every frame's time, render passes and
 * shader program count, with the targets checked in one summary.
 *
 * "No shader compiles after the first visit to each room": the program count may grow on
 * the frames a room is entered for the first time (and before the first room); any growth
 * while standing in a room already visited is a late compile.
 */

/** CP10 B1 targets. */
export const PERF_TARGETS = {
  minAvgFps: 60,
  maxP95Ms: 16.7,
  maxPasses: 12,
} as const;

export interface PerfFrame {
  /** Time since the previous frame (ms). */
  frameMs: number;
  passes: number;
  /** Shader programs compiled while rendering, summed (EngineInfo.renderCompiles). */
  renderCompiles: number;
  room: string;
  missingPortalTargets: number;
}

export interface PerfLogSummary {
  seconds: number;
  frames: number;
  avgFps: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  maxPasses: number;
  missingPortalTargets: number;
  roomsVisited: number;
  /** Render-time compiles in a room visited before: when, where, how many so far. */
  lateCompiles: { atSeconds: number; room: string; compiles: number }[];
  /** Render-time compiles during the log (first visits included). */
  renderCompiles: number;
  /** Each target, met or not. */
  targets: {
    avgFps: boolean;
    p95: boolean;
    passes: boolean;
    missingPortalTargets: boolean;
    lateCompiles: boolean;
  };
}

export class PerfLog {
  private frames: PerfFrame[] = [];
  private visited = new Set<string>();
  private late: PerfLogSummary['lateCompiles'] = [];
  private lastCompiles = -1;
  private compiles = 0;
  private elapsedMs = 0;
  /** Missing targets seen during the log (the engine's counter restarts with every game). */
  private missing = 0;
  private lastMissing = -1;

  /** Records a frame. Frames longer than 1 s (tab hidden, debugger) are skipped. */
  record(f: PerfFrame): void {
    const m = f.missingPortalTargets;
    if (this.lastMissing >= 0) this.missing += m >= this.lastMissing ? m - this.lastMissing : m;
    this.lastMissing = m;
    if (f.frameMs > 0 && f.frameMs < 1000) {
      this.frames.push(f);
      this.elapsedMs += f.frameMs;
    }
    const firstVisit = f.room !== '' && !this.visited.has(f.room);
    const grew = this.lastCompiles >= 0 ? f.renderCompiles - this.lastCompiles : 0;
    if (grew > 0) {
      this.compiles += grew;
      if (!firstVisit) {
        this.late.push({ atSeconds: this.elapsedMs / 1000, room: f.room, compiles: this.compiles });
      }
    }
    if (f.room !== '') this.visited.add(f.room);
    this.lastCompiles = f.renderCompiles;
  }

  /** Starts over (for example when the walk begins). */
  reset(): void {
    this.frames = [];
    this.visited = new Set();
    this.late = [];
    this.lastCompiles = -1;
    this.compiles = 0;
    this.elapsedMs = 0;
    this.missing = 0;
    this.lastMissing = -1;
  }

  summary(): PerfLogSummary {
    const n = this.frames.length;
    const times = this.frames.map((f) => f.frameMs).sort((a, b) => a - b);
    const total = times.reduce((a, b) => a + b, 0);
    const avgMs = n > 0 ? total / n : 0;
    const p95Ms = n > 0 ? (times[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] ?? 0) : 0;
    const maxPasses = this.frames.reduce((m, f) => Math.max(m, f.passes), 0);
    const missing = this.missing;
    const avgFps = avgMs > 0 ? 1000 / avgMs : 0;
    return {
      seconds: total / 1000,
      frames: n,
      avgFps,
      avgMs,
      p95Ms,
      maxMs: times[n - 1] ?? 0,
      maxPasses,
      missingPortalTargets: missing,
      roomsVisited: this.visited.size,
      lateCompiles: [...this.late],
      renderCompiles: this.compiles,
      targets: {
        avgFps: avgFps >= PERF_TARGETS.minAvgFps,
        p95: p95Ms <= PERF_TARGETS.maxP95Ms,
        passes: maxPasses <= PERF_TARGETS.maxPasses,
        missingPortalTargets: missing === 0,
        lateCompiles: this.late.length === 0,
      },
    };
  }
}
