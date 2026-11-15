/**
 * `docs/api/openapi.json` must match the route schemas (CP07 T8). Regenerate with
 * `pnpm --filter @ogm/server openapi`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPENAPI_PATH, openApiJson } from './openapi.js';

describe('OpenAPI (CP07 T8)', () => {
  it('the committed docs/api/openapi.json is up to date', async () => {
    const json = await openApiJson();
    expect(existsSync(OPENAPI_PATH), 'run pnpm --filter @ogm/server openapi').toBe(true);
    expect(readFileSync(OPENAPI_PATH, 'utf8'), 'run pnpm --filter @ogm/server openapi').toBe(json);
  });

  it('documents every endpoint', async () => {
    const doc = JSON.parse(await openApiJson()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const routes = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`),
    );
    expect(routes.sort()).toEqual(
      [
        'POST /api/v1/games',
        'POST /api/v1/games/{id}/start',
        'POST /api/v1/games/{id}/transitions',
        'POST /api/v1/games/{id}/complete',
        'GET /api/v1/games/{id}/rooms',
        'GET /api/v1/games/{id}/debug',
        'POST /api/v1/client-errors',
        'GET /api/v1/health',
      ].sort(),
    );
  });
});
