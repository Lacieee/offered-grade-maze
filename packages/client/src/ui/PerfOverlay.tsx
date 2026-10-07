import { useEffect, useState } from 'react';
import type { PerfSummary } from '../engine/Engine.js';
import { useUiStore } from './store.js';

/** `?perf=1` panel: FPS, frame time (average and p95 over 2 s), draw calls, triangles, passes. */
export function PerfOverlay() {
  const engine = useUiStore((s) => s.engine);
  const [perf, setPerf] = useState<PerfSummary | null>(null);

  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      setPerf(engine.getPerf());
    }, 250);
    return () => {
      window.clearInterval(id);
    };
  }, [engine]);

  if (!perf) return null;
  return (
    <div className="perf-overlay" data-testid="perf-overlay">
      <div>
        <b>{perf.fps.toFixed(0)}</b> fps
      </div>
      <div>
        avg {perf.avgMs.toFixed(1)} ms · p95 {perf.p95Ms.toFixed(1)} ms
      </div>
      <div>
        calls {perf.drawCalls} · tris {perf.triangles}
      </div>
      <div>passes {perf.passes}</div>
    </div>
  );
}
