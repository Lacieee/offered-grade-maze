/**
 * Chooses the screen for the game phase (CP08 T6). The canvas stays mounted underneath.
 */
import { Suspense, lazy, useEffect } from 'react';
import { useUiStore } from '../ui/store.js';
import type { GameController } from './game/controller.js';
import { useGame } from './game/store.js';
import {
  CompletingScreen,
  ErrorScreen,
  Hud,
  LoadingScreen,
  NewGameScreen,
  PauseOverlay,
  ReadyScreen,
  ResultScreen,
  TitleScreen,
  UnsupportedScreen,
} from './ui/screens.js';
import { SettingsScreen } from './ui/settings.js';

/** Loaded on first open (CP10 A1.4). */
const DebugOverlay = lazy(() => import('./debug/DebugOverlay.js'));

/**
 * Debug view toggle keys (CP10 A1.1), by `event.code`: the key under Esc reports `Backquote`
 * on ANSI and `IntlBackslash` on Apple ISO keyboards; F9 may need fn on a Mac.
 */
export const DEBUG_KEYS: readonly string[] = ['Backquote', 'IntlBackslash', 'F9'];

export function GameShell({ game, showOverlay }: { game: GameController; showOverlay: boolean }) {
  const settingsOpen = useGame((s) => s.settingsOpen);
  const debugOpen = useGame((s) => s.debugOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (DEBUG_KEYS.includes(e.code) && !e.repeat) {
        e.preventDefault();
        game.toggleDebug();
      } else if (e.code === 'Escape' && useGame.getState().debugOpen) {
        game.closeDebug();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [game]);
  return (
    <>
      <PhaseScreen game={game} showOverlay={showOverlay} />
      {debugOpen && (
        <Suspense fallback={null}>
          <DebugOverlay game={game} />
        </Suspense>
      )}
      {settingsOpen && <SettingsScreen />}
    </>
  );
}

function PhaseScreen({ game, showOverlay }: { game: GameController; showOverlay: boolean }) {
  const phase = useGame((s) => s.phase);
  const locked = useUiStore((s) => s.pointerLocked);
  const debugOpen = useGame((s) => s.debugOpen);
  switch (phase) {
    case 'title':
      return <TitleScreen game={game} />;
    case 'newGame':
      return <NewGameScreen game={game} />;
    case 'loading':
      return <LoadingScreen />;
    case 'ready':
      return showOverlay ? <ReadyScreen game={game} /> : null;
    case 'playing':
      return showOverlay ? (
        <>
          <Hud />
          {!locked && !debugOpen && <PauseOverlay game={game} />}
        </>
      ) : null;
    case 'completing':
      return (
        <>
          <div className="pickup-flash" data-testid="pickup-flash" />
          <CompletingScreen />
        </>
      );
    case 'result':
      return <ResultScreen game={game} />;
    case 'error':
      return <ErrorScreen game={game} />;
    case 'unsupported':
      return <UnsupportedScreen />;
  }
}
