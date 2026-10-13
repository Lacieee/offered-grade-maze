import { parseSeed } from '@ogm/shared';
import { useEffect, useRef, useState } from 'react';
import { GameShell } from './app/GameShell.js';
import { GameController } from './app/game/controller.js';
import { useGame } from './app/game/store.js';
import { UnsupportedScreen as GameUnsupported } from './app/ui/screens.js';
import { GameAudio } from './app/game/audio.js';
import { useSettings, type Settings } from './app/settings/settings.js';
import { DEFAULT_SENSITIVITY, Engine, UnsupportedError } from './engine/Engine.js';
import type { Volumes } from './engine/audio/AudioEngine.js';
import { HttpApi, type GameApi } from './engine/net/api.js';
import { PerfOverlay } from './ui/PerfOverlay.js';
import { ClickToPlay, DevHud, ErrorScreen, GraphicsReset } from './ui/Screens.js';
import { useUiStore } from './ui/store.js';

/** Volumes from the settings. */
function volumesOf(s: Settings): Volumes {
  return { master: s.master, music: s.music, sfx: s.sfx };
}

/**
 * Mounts the engine on a full-window canvas and renders the React overlay on top.
 * The canvas is created per mount, so React Strict Mode's double effect run is safe.
 */
export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameController | null>(null);
  const status = useUiStore((s) => s.status);
  const locked = useUiStore((s) => s.pointerLocked);
  const graphicsReset = useUiStore((s) => s.graphicsReset);
  const params = new URLSearchParams(window.location.search);
  const showPerf = params.get('perf') === '1';
  const devScene = import.meta.env.DEV ? params.get('dev') : null;
  // `?overlay=0` hides the HUD and hints (deterministic screenshots in tests).
  const showOverlay = params.get('overlay') !== '0';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ui = useUiStore.getState();
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);

    if (import.meta.env.DEV && devScene === 'prefabs') {
      // The prefab gallery (CP06 T5) runs its own small renderer, not the game engine.
      let stopGallery: (() => void) | null = null;
      let cancelled = false;
      import('./dev/prefabGallery.js').then(
        ({ startPrefabGallery }) => {
          if (cancelled) return;
          stopGallery = startPrefabGallery(canvas, host);
          useUiStore.getState().setStatus('gallery');
        },
        (err: unknown) => {
          useUiStore.getState().setStatus('error', String(err));
        },
      );
      return () => {
        cancelled = true;
        stopGallery?.();
        canvas.remove();
      };
    }

    const engine = new Engine();
    const quality = params.get('quality');
    // `?quality=` pins the quality (tests); otherwise the setting decides (CP09 T7).
    const pinnedQuality =
      quality === 'high' || quality === 'low' || quality === 'auto' ? quality : null;
    try {
      engine.init(canvas, {
        quality: pinnedQuality ?? useSettings.getState().settings.quality,
        portalDebug: import.meta.env.DEV && params.get('portalDebug') === '1',
      });
    } catch (err) {
      canvas.remove();
      if (err instanceof UnsupportedError) ui.setStatus('unsupported');
      else ui.setStatus('error', err instanceof Error ? err.message : String(err));
      return;
    }

    const unsubscribe = [
      engine.on('roomChanged', (change) => {
        useUiStore.getState().setRoom(change.to);
      }),
      engine.on('contextLost', (lost) => {
        useUiStore.getState().setGraphicsReset(lost);
      }),
      engine.on('pointerLock', (isLocked) => {
        useUiStore.getState().setPointerLocked(isLocked);
      }),
    ];
    ui.setEngine(engine);

    let cancelled = false;
    let stopScene: (() => void) | null = null;
    let removeHook: (() => void) | null = null;
    if (import.meta.env.DEV && devScene === 'level') {
      void Promise.all([import('./dev/levelScene.js'), import('./dev/testHook.js')])
        .then(async ([{ loadLevelFile, startLevelScene }, { installTestHook }]) => {
          const level = await loadLevelFile(params.get('file') ?? 'sample-medium');
          if (cancelled) return;
          stopScene = startLevelScene(engine, level, params.get('room'));
          removeHook = installTestHook(engine);
          useUiStore.getState().setStatus('running');
        })
        .catch((err: unknown) => {
          useUiStore.getState().setStatus('error', String(err));
        });
    } else if (import.meta.env.DEV && devScene === 'fixtures') {
      void Promise.all([import('./dev/fixtureScene.js'), import('./dev/testHook.js')]).then(
        ([{ startFixtureScene }, { installTestHook }]) => {
          if (cancelled) return;
          stopScene = startFixtureScene(engine, params.get('room'));
          removeHook = installTestHook(engine);
          useUiStore.getState().setStatus('running');
        },
        (err: unknown) => {
          useUiStore.getState().setStatus('error', String(err));
        },
      );
    } else {
      // The game (CP08): the real API, or the in-browser mock with `?mock=1` (dev only).
      let controller: GameController | null = null;
      // The mock is exposed for tests only once this mount owns it: under Strict Mode a
      // cancelled first mount must not leave its mock in `window.__ogmMock`.
      let exposeMock: (() => void) | null = null;
      const api: Promise<GameApi> =
        import.meta.env.DEV && params.get('mock') === '1'
          ? import('./dev/mockApi.js').then(({ MockApi }) => {
              const mock = new MockApi(Number(params.get('latency') ?? 0) || 0);
              exposeMock = () => {
                mock.expose();
              };
              return mock;
            })
          : Promise.resolve(new HttpApi());
      void api
        .then(async (gameApi) => {
          if (cancelled) return;
          exposeMock?.();
          controller = new GameController({
            engine,
            api: gameApi,
            createSound: () => GameAudio.start(engine, volumesOf(useSettings.getState().settings)),
          });
          // Settings apply live (CP09 T7).
          const c = controller;
          let previous: Settings | null = null;
          const apply = (s: Settings) => {
            engine.setLookSettings({
              sensitivity: DEFAULT_SENSITIVITY * s.sensitivity,
              invertY: s.invertY,
            });
            engine.setFov(s.fov);
            engine.setHeadBob(s.headBob);
            c.setVolumes(volumesOf(s));
            if (previous !== null && previous.quality !== s.quality) engine.setQuality(s.quality);
            previous = s;
          };
          apply(useSettings.getState().settings);
          const offSettings = useSettings.subscribe((st) => {
            apply(st.settings);
          });
          unsubscribe.push(offSettings);
          if (import.meta.env.DEV) {
            const { installTestHook } = await import('./dev/testHook.js');
            // The cleanup may have run while the import was loading.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (cancelled) return;
            const c = controller;
            removeHook = installTestHook(engine, () => {
              const s = useGame.getState();
              return {
                phase: s.phase,
                gameId: s.gameId,
                seed: s.seed,
                lastSeq: c.transitions?.lastSeq ?? 0,
                pending: c.transitions?.pending ?? 0,
                desync: s.desync,
                reconnecting: s.reconnecting,
              };
            });
          }
          // `/?seed=M1-7K2Q-X9MP` opens New game on the seed tab, prefilled (CP08 T7).
          const seed = params.get('seed');
          if (seed !== null) {
            const parsed = parseSeed(seed);
            controller.toNewGame('seed', parsed.ok ? parsed.seed.canonical : seed);
          } else controller.toTitle();
          setGame(controller);
          useUiStore.getState().setStatus('game');
        })
        .catch((err: unknown) => {
          useUiStore.getState().setStatus('error', String(err));
        });
      stopScene = () => {
        controller?.dispose();
        setGame(null);
      };
    }

    return () => {
      cancelled = true;
      stopScene?.();
      removeHook?.();
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
      {showOverlay && (
        <div className="overlay">
          {status === 'running' && !locked && <ClickToPlay />}
          {status === 'running' && showPerf && <PerfOverlay />}
          {status === 'running' && import.meta.env.DEV && (
            <DevHud hint={devScene === 'level' ? '[ ] switch rooms' : 'keys 1–6 switch rooms'} />
          )}
          {status === 'gallery' && (
            <div className="dev-hud">
              prefab gallery · click to look · WASD Q E move · Shift faster · F footprints
            </div>
          )}
          {status === 'game' && showPerf && <PerfOverlay />}
          {graphicsReset && <GraphicsReset />}
        </div>
      )}
      {status === 'game' && game && <GameShell game={game} showOverlay={showOverlay} />}
      {status === 'unsupported' && <GameUnsupported />}
      {status === 'error' && <ErrorScreen />}
    </>
  );
}
