import { useEffect, useRef, useState } from 'react';
import { PerfLog, type PerfLogSummary } from '../engine/debug/PerfLog.js';
import type { EngineInfo, PerfSummary } from '../engine/Engine.js';
import { useUiStore } from './store.js';

/**
 * `?perf=1` panel: FPS, frame time (average and p95 over 2 s), draw calls, triangles, passes,
 * and the portal quality level (automatic quality lowers the portal depth when frames are slow).
 *
 * It also keeps the CP10 B1 performance log of every frame since the last reset: "Copy log"
 * puts the summary (targets checked) on the clipboard, and `data-perf-summary` carries it for
 * the scripted walk (`pnpm perf:walk`).
 */
export function PerfOverlay() {
  const engine = useUiStore((s) => s.engine);
  const [perf, setPerf] = useState<PerfSummary | null>(null);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [log, setLog] = useState<PerfLogSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const recorder = useRef(new PerfLog());

  useEffect(() => {
    if (!engine) return;
    const off = engine.on('frame', ({ dt }) => {
      const i = engine.debugInfo();
      recorder.current.record({
        frameMs: dt * 1000,
        passes: i.passes,
        renderCompiles: i.renderCompiles,
        room: engine.getState().room,
        missingPortalTargets: i.missingPortalTargets,
      });
    });
    const id = window.setInterval(() => {
      setPerf(engine.getPerf());
      setInfo(engine.debugInfo());
      setLog(recorder.current.summary());
    }, 250);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, [engine]);

  const report = (): string =>
    JSON.stringify(
      {
        summary: recorder.current.summary(),
        quality: info ? `${info.qualityMode} L${String(info.qualityLevel)}` : null,
        viewport: `${String(window.innerWidth)}×${String(window.innerHeight)} @${String(window.devicePixelRatio)}x`,
        userAgent: navigator.userAgent,
        at: new Date().toISOString(),
      },
      null,
      2,
    );

  if (!perf) return null;
  return (
    <div
      className="perf-overlay"
      data-testid="perf-overlay"
      data-perf-summary={log ? JSON.stringify(log) : undefined}
    >
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
      {log && (
        <div>
          log {log.seconds.toFixed(0)} s · {log.avgFps.toFixed(0)} fps · p95 {log.p95Ms.toFixed(1)}{' '}
          ms · late compiles {log.lateCompiles.length}
        </div>
      )}
      <div className="perf-actions interactive">
        <button
          type="button"
          data-testid="perf-reset"
          onClick={() => {
            recorder.current.reset();
            setCopied(false);
          }}
        >
          Reset log
        </button>
        <button
          type="button"
          data-testid="perf-copy"
          onClick={() => {
            void navigator.clipboard.writeText(report()).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy log'}
        </button>
      </div>
    </div>
  );
}
