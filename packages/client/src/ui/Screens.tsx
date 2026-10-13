import { useEffect, useState } from 'react';
import { useT } from '../app/i18n/index.js';
import type { EngineState } from '../engine/Engine.js';
import { useUiStore } from './store.js';

/** Shown when start-up fails for another reason. */
export function ErrorScreen() {
  const error = useUiStore((s) => s.error);
  return (
    <div className="screen" role="alert">
      <h1>Something went wrong</h1>
      <p>{error ?? 'Unknown error.'}</p>
    </div>
  );
}

/** Hint shown while the pointer is not locked. Clicks pass through to the canvas. */
export function ClickToPlay() {
  return (
    <div className="click-to-play">
      <p>Click to play</p>
      <p className="hint">WASD to move · mouse to look · Esc to release the mouse</p>
    </div>
  );
}

/** Dev-only label with the current room and player position. */
export function DevHud({ hint }: { hint: string }) {
  const room = useUiStore((s) => s.room);
  const engine = useUiStore((s) => s.engine);
  const [state, setState] = useState<EngineState | null>(null);
  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      setState(engine.getState());
    }, 250);
    return () => {
      window.clearInterval(id);
    };
  }, [engine]);
  const pos = state
    ? ` · x ${state.x.toFixed(2)} z ${state.z.toFixed(2)} yaw ${((state.yaw * 180) / Math.PI).toFixed(0)}°`
    : '';
  return (
    <div className="dev-hud" data-testid="dev-hud">
      {room ?? '—'}
      {pos} · {hint}
    </div>
  );
}

/** Shown while the WebGL context is lost and being restored. */
export function GraphicsReset() {
  const t = useT();
  return (
    <div className="graphics-reset" role="status" data-testid="graphics-reset">
      {t('graphics.reset')}
    </div>
  );
}
