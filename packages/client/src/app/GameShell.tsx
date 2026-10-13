/**
 * Chooses the screen for the game phase (CP08 T6). The canvas stays mounted underneath.
 */
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

export function GameShell({ game, showOverlay }: { game: GameController; showOverlay: boolean }) {
  const settingsOpen = useGame((s) => s.settingsOpen);
  return (
    <>
      <PhaseScreen game={game} showOverlay={showOverlay} />
      {settingsOpen && <SettingsScreen />}
    </>
  );
}

function PhaseScreen({ game, showOverlay }: { game: GameController; showOverlay: boolean }) {
  const phase = useGame((s) => s.phase);
  const locked = useUiStore((s) => s.pointerLocked);
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
          {!locked && <PauseOverlay game={game} />}
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
