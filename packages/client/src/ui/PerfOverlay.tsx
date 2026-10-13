import { useEffect, useState } from 'react';
import type { EngineInfo, PerfSummary } from '../engine/Engine.js';
import { useUiStore } from './store.js';

/**
 * `?perf=1` panel: FPS, frame time (average and p95 over 2 s), draw calls, triangles, passes,
 * and the portal quality level (automatic quality lowers the portal depth when frames are slow).
 */
export function PerfOverlay() {
  const engine = useUiStore((s) => s.engine);
  const [perf, setPerf] = useState<PerfSummary | null>(null);
  const [info, setInfo] = useState<EngineInfo | null>(null);

  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      setPerf(engine.getPerf());
      setInfo(engine.debugInfo());
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
      {info && (
        <div>
          quality {info.qualityMode} L{info.qualityLevel}
        </div>
      )}
      {info && (
        <div data-testid="missing-portal-targets">
          missing {info.missingPortalTargets} · pending {info.pendingRooms}
        </div>
      )}
    </div>
  );
}
