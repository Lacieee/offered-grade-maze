import { useEffect, useState } from 'react';
import type { EngineState } from '../engine/Engine.js';
import { useUiStore } from './store.js';

/** Shown instead of the game when WebGL2 is missing. */
export function UnsupportedScreen() {
  return (
    <div className="screen" role="alert">
      <h1>Offered Grade Maze</h1>
      <p>This game needs a desktop browser with WebGL2.</p>
    </div>
  );
}

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

/** Placeholder home screen until the real menus arrive in CP08. */
export function HomeScreen() {
  return (
    <div className="screen">
      <h1>Offered Grade Maze</h1>
      <p>The game arrives in a later checkpoint.</p>
      {import.meta.env.DEV && (
        <p>
          <a className="interactive" href="?dev=fixtures&room=r00">
            Open the fixture house (dev)
          </a>
        </p>
      )}
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
export function DevHud() {
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
      {pos} · keys 1–6 switch rooms
    </div>
  );
}

/** Shown while the WebGL context is lost and being restored. */
export function GraphicsReset() {
  return (
    <div className="graphics-reset" role="status" data-testid="graphics-reset">
      Graphics reset — restoring…
    </div>
  );
}
