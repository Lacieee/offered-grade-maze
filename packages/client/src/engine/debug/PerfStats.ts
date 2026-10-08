/** Rolling performance statistics for the `?perf=1` overlay. */
export interface PerfSummary {
  /** Frames per second over the window. */
  fps: number;
  /** Mean frame time (ms) over the window. */
  avgMs: number;
  /** 95th percentile frame time (ms) over the window. */
  p95Ms: number;
  /**
   * Display refresh interval estimate (ms): the 10th percentile frame time. Frames snap to
   * multiples of the refresh, so the fast ones show it.
   */
  refreshMs: number;
  /** Draw calls in the last frame (all passes). */
  drawCalls: number;
  /** Triangles in the last frame (all passes). */
  triangles: number;
  /** Render passes in the last frame (1 until portals arrive in CP03). */
  passes: number;
}

interface Sample {
  at: number;
  frameMs: number;
}

/** Collects frame times over a sliding window (default 2 s). */
export class PerfStats {
  private samples: Sample[] = [];
  private last = { drawCalls: 0, triangles: 0, passes: 0 };

  constructor(private readonly windowMs = 2000) {}

  /** Records one rendered frame ending at `nowMs` that took `frameMs` since the previous one. */
  record(
    nowMs: number,
    frameMs: number,
    render: { drawCalls: number; triangles: number; passes: number },
  ): void {
    this.samples.push({ at: nowMs, frameMs });
    const cutoff = nowMs - this.windowMs;
    let drop = 0;
    while (drop < this.samples.length && (this.samples[drop]?.at ?? 0) < cutoff) drop++;
    if (drop > 0) this.samples.splice(0, drop);
    this.last = { ...render };
  }

  /** Forgets every frame (after a pause, so the gap does not count as a slow frame). */
  reset(): void {
    this.samples = [];
  }

  /** Summary of the current window. */
  summary(): PerfSummary {
    const n = this.samples.length;
    if (n === 0) return { fps: 0, avgMs: 0, p95Ms: 0, refreshMs: 0, ...this.last };
    const times = this.samples.map((s) => s.frameMs);
    const total = times.reduce((a, b) => a + b, 0);
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] ?? 0;
    const p10 = sorted[Math.max(0, Math.ceil(n * 0.1) - 1)] ?? 0;
    return {
      fps: total > 0 ? (n * 1000) / total : 0,
      avgMs: total / n,
      p95Ms: p95,
      refreshMs: p10,
      ...this.last,
    };
  }
}
