import { useEffect, useRef } from 'react';
import { Engine, UnsupportedError } from './engine/Engine.js';
import { PerfOverlay } from './ui/PerfOverlay.js';
import { ClickToPlay, DevHud, ErrorScreen, HomeScreen, UnsupportedScreen } from './ui/Screens.js';
import { useUiStore } from './ui/store.js';

/**
 * Mounts the engine on a full-window canvas and renders the React overlay on top.
 * The canvas is created per mount, so React Strict Mode's double effect run is safe.
 */
export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const status = useUiStore((s) => s.status);
  const locked = useUiStore((s) => s.pointerLocked);
  const params = new URLSearchParams(window.location.search);
  const showPerf = params.get('perf') === '1';
  const devScene = import.meta.env.DEV ? params.get('dev') : null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ui = useUiStore.getState();
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const engine = new Engine();
    try {
      engine.init(canvas);
    } catch (err) {
      canvas.remove();
      if (err instanceof UnsupportedError) ui.setStatus('unsupported');
      else ui.setStatus('error', err instanceof Error ? err.message : String(err));
      return;
    }

    const unsubscribe = [
      engine.on('roomChanged', (room) => {
        useUiStore.getState().setRoom(room);
      }),
      engine.on('pointerLock', (isLocked) => {
        useUiStore.getState().setPointerLocked(isLocked);
      }),
    ];
    ui.setEngine(engine);

    let cancelled = false;
    let stopScene: (() => void) | null = null;
    if (import.meta.env.DEV && devScene === 'fixtures') {
      void import('./dev/fixtureScene.js').then(
        ({ startFixtureScene }) => {
          if (cancelled) return;
          stopScene = startFixtureScene(engine, params.get('room'));
          useUiStore.getState().setStatus('running');
        },
        (err: unknown) => {
          useUiStore.getState().setStatus('error', String(err));
        },
      );
    } else {
      ui.setStatus('home');
    }

    return () => {
      cancelled = true;
      stopScene?.();
      for (const off of unsubscribe) off();
      engine.dispose();
      canvas.remove();
      useUiStore.getState().setEngine(null);
    };
    // Mount once: the URL is read at start-up only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="game-host" ref={hostRef} />
      <div className="overlay">
        {status === 'running' && !locked && <ClickToPlay />}
        {status === 'running' && showPerf && <PerfOverlay />}
        {status === 'running' && import.meta.env.DEV && <DevHud />}
      </div>
      {status === 'home' && <HomeScreen />}
      {status === 'unsupported' && <UnsupportedScreen />}
      {status === 'error' && <ErrorScreen />}
    </>
  );
}
