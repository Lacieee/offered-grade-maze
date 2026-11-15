/**
 * Writes `docs/api/openapi.json` from the route schemas (CP07 T8):
 * `pnpm --filter @ogm/server openapi`. A test fails when the committed file is out of date.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { Db } from './db/client.js';

/** The committed spec. */
export const OPENAPI_PATH = fileURLToPath(
  new URL('../../../docs/api/openapi.json', import.meta.url),
);

/** The OpenAPI document as formatted JSON (no database needed). */
export async function openApiJson(): Promise<string> {
  const config = loadConfig({ DEBUG_VIEW_ENABLED: 'true', LOG_LEVEL: 'silent' });
  const { app } = await buildApp({ config, db: {} as Db, logger: false });
  await app.ready();
  const json = `${JSON.stringify(app.swagger(), null, 2)}\n`;
  await app.close();
  return json;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = await openApiJson();
  mkdirSync(dirname(OPENAPI_PATH), { recursive: true });
  writeFileSync(OPENAPI_PATH, json);
  console.log(`wrote ${OPENAPI_PATH}`);
}
