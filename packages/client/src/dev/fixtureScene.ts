/**
 * Dev launcher for the fixture house: `/?dev=fixtures&room=r00`.
 * Only reachable in dev builds (imported behind `import.meta.env.DEV`).
 */
import type { Engine } from '../engine/Engine.js';
import { FIXTURE_ROOMS, FIXTURE_START, fixtureRoom, fixtureSpawn } from './fixtures/index.js';

/** Keys Digit1…Digit6 jump to r00…r05. */
const ROOM_KEYS: Readonly<Record<string, string>> = {
  Digit1: 'r00',
  Digit2: 'r01',
  Digit3: 'r02',
  Digit4: 'r03',
  Digit5: 'r04',
  Digit6: 'r05',
};

/** Loads the fixture house, spawns in `roomId` (default r00) and starts the engine. */
export function startFixtureScene(engine: Engine, roomId: string | null): () => void {
  engine.loadRooms(FIXTURE_ROOMS);
  const jump = (id: string): void => {
    const room = fixtureRoom(id);
    if (room) engine.setCurrentRoom(room.id, fixtureSpawn(room));
  };
  jump(fixtureRoom(roomId ?? '') ? (roomId ?? FIXTURE_START) : FIXTURE_START);

  const onKey = (e: KeyboardEvent): void => {
    const id = ROOM_KEYS[e.code];
    if (id && !e.repeat) jump(id);
  };
  window.addEventListener('keydown', onKey);
  engine.start();
  return () => {
    window.removeEventListener('keydown', onKey);
  };
}
