/**
 * Helpers that play a game through the API (integration tests).
 */
import {
  CreateGameResponseSchema,
  DebugResponseSchema,
  StartResponseSchema,
  TransitionResponseSchema,
  type CreateGameResponse,
  type DebugResponse,
  type Difficulty,
  type TransitionResponse,
} from '@ogm/shared';
import { expectBody, type TestApp } from './harness.js';

/** Creates a game (random of `difficulty`, or a typed seed). */
export async function createGame(
  t: TestApp,
  what: { difficulty: Difficulty } | { seed: string },
): Promise<CreateGameResponse> {
  const body = 'seed' in what ? { mode: 'seed', seed: what.seed } : { mode: 'random', ...what };
  return expectBody(await t.call('POST', '/api/v1/games', body), 201, CreateGameResponseSchema);
}

export async function startGame(t: TestApp, id: string): Promise<string> {
  return expectBody(await t.call('POST', `/api/v1/games/${id}/start`), 200, StartResponseSchema)
    .startedAt;
}

export async function debugView(t: TestApp, id: string): Promise<DebugResponse> {
  return expectBody(await t.call('GET', `/api/v1/games/${id}/debug`), 200, DebugResponseSchema);
}

export async function cross(
  t: TestApp,
  id: string,
  seq: number,
  from: string,
  door: string,
  clientElapsedMs = seq * 1000,
): Promise<TransitionResponse> {
  return expectBody(
    await t.call('POST', `/api/v1/games/${id}/transitions`, { seq, from, door, clientElapsedMs }),
    200,
    TransitionResponseSchema,
  );
}

/**
 * Walks `pathFromStart` to the goal; calls `after` after every transition. Returns the
 * number of transitions made.
 */
export async function walkToGoal(
  t: TestApp,
  id: string,
  debug: DebugResponse,
  after?: (r: TransitionResponse) => void,
): Promise<number> {
  let seq = 0;
  for (const step of debug.pathFromStart) {
    if (step.exitDoor === null) break;
    seq++;
    const r = await cross(t, id, seq, step.room, step.exitDoor);
    after?.(r);
  }
  return seq;
}
