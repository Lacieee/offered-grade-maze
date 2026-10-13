# ADR-0008: Backend details

- **Status:** accepted
- **Date:** 2026-10-13
- **Checkpoint / task:** CP07 (T1–T9)

## Context

CP07 specifies the Fastify backend, its database, the game rules it enforces and the local
Docker packaging. Building it raised points the checkpoint leaves open. This ADR records how
each one was settled.

## Decision

### 1. Shared DTOs added (extensions only)

`@ogm/shared` gains four schemas the endpoints need. No existing schema changed.

- `RoomsResponseSchema`: `{ rooms }` for `GET /games/:id/rooms`.
- `ClientErrorRequestSchema`: `{ message ≤ 2 000, stack? ≤ 6 000, context? }`. The route also
  caps the whole body at 8 kB and answers 413 above that.
- `HealthResponseSchema`: `{ status: 'ok', db: 'ok' | 'down', version }`.
- `DesyncErrorSchema`: the error body plus `current` and `lastSeq`.

### 2. Error codes

Every non-2xx response is `{ error: { code, message } }`. 409 `desync` also carries `current`
and `lastSeq`. Stack traces are never sent.

| Status | Codes                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` (schema), `invalid_seed`                                                         |
| 403    | `room_not_available`                                                                               |
| 404    | `game_not_found`, `not_found` (unknown route, or debug view disabled)                              |
| 409    | `not_started`, `already_completed`, `game_expired`, `desync`, `pending_transitions`, `not_at_goal` |
| 413    | `payload_too_large`                                                                                |
| 422    | `unsupported_version`, `seed_not_playable`                                                         |
| 429    | `rate_limited`                                                                                     |
| 500    | `level_drift`, `internal`                                                                          |
| 503    | `generation_unavailable` (five random seeds failed)                                                |

`game_expired` is new. The checkpoint does not say what an expired game answers.

### 3. Rules the checkpoint leaves open

- **One clock.** The app's clock sets `started_at`, `completed_at` and `server_at`; the
  database's `now()` is not used. This keeps the timing rule correct even if the app and
  database clocks differ. Tests inject the clock to cover both time sources.
- **Level drift is checked on every lookup**, not only on a cache miss. Comparing two hashes
  costs nothing. A mismatch logs `game.level_drift` and answers 500 for that game.
- **Replays are matched by `seq` alone.** If `seq ≤ last_seq` and a transition with that
  `seq` is stored, the response is the stored outcome with `rooms: []`.
- **`/complete` is idempotent in full.** Once a game is completed, every later call returns
  the stored result, whatever its body says.
- **Order of the `/complete` checks:** `lastSeq` first (`pending_transitions`), then the goal
  (`not_at_goal`).
- **Server time is used when the client claims more time** than the server measured (negative
  lag). The rule is `0 ≤ server − client ≤ 5 000 ms`, so negative lag falls outside it.
- **Expiry.** An expired game ended 24 h after `started_at`. Its transitions are deleted once
  `started_at` is 31 days old. Results are never deleted.

### 4. Privacy and logs

- The database stores no IP addresses or user agents.
- The logs leave them out too: the request serializer keeps only the method, URL and request
  id.
- The request id comes from a well-formed `x-request-id` header, or a fresh UUID.
- `trustProxy` is off, so rate limits key on the socket address. The server is local (PD4).

### 5. HTTP

- **CSP:**
  - `default-src 'self'`; scripts are `'self'` only;
  - `style-src` adds `'unsafe-inline'` (React inline styles);
  - `worker-src` adds `blob:`, and images and media add `data:` and `blob:`.
- **HSTS and `upgrade-insecure-requests` are off**, because the game runs on plain-HTTP
  localhost.
- **Static files.** Hashed files under `assets/` are cached for a year (`immutable`), other
  static files for an hour, and `index.html` is `no-cache`. Any GET or HEAD outside
  `/api/v1/` falls back to `index.html`; unknown API paths answer 404 in the error format.
- **Rate limits.**
  - `POST /games`: 20 per minute per IP.
  - `POST /client-errors`: 10 per minute per IP.
  - `POST /transitions`: 20 per second per game.
  - `RATE_LIMIT_ENABLED=false` skips the plugin.
- **Two extra variables.** `HOST` (default `0.0.0.0`) and `CLIENT_DIST` (default
  `packages/client/dist`) join the configuration table.

### 6. Tests and CI

- **Test databases.** Integration tests use a real PostgreSQL. Each test file creates a fresh,
  migrated database and drops it afterwards. Tests run in parallel without sharing state.
- **Without a database** the integration suites are skipped with a warning, so `pnpm test`
  still works on a machine without Docker. With `OGM_REQUIRE_DB=1` (CI) they fail instead.
- **CI** runs a `postgres:16` service. The server's `test` task is not cached by Turborepo,
  because a cached "skipped" result would hide failures.
- **OpenAPI.** `docs/api/openapi.json` is generated from the route schemas
  (`jsonSchemaTransform`). A unit test and a CI step fail when it is out of date. Prettier
  ignores the file, so its bytes are exactly what the generator writes.
- **Game creation time.** `pnpm --filter @ogm/server bench:create` measures `POST /games` for
  Hard, with a cache miss on every request. A quick 30-game guard runs in the test suite.

### 7. Packaging

- **Builder stage.** `node:22-slim` with corepack's pnpm. It runs a frozen install, builds
  `shared`, `generator`, `server` and `client` with Turborepo, then
  `pnpm --filter @ogm/server deploy --prod`. That gives production `node_modules` with
  `shared` and `generator` copied in, plus the `drizzle/` migrations.
- **Runtime stage.** `node:22-slim` running as the non-root `node` user, with the server at
  `/app/server` and the client at `/app/client`. `HEALTHCHECK` passes only when `/api/v1/health`
  reports `db: ok`.
- **`docker-compose.yml`** has `db` (`postgres:16`, a named volume, a health check) and `app`
  (waits for a healthy `db`, port 8080). CI builds it and checks the health endpoint and
  the client page.

## Consequences

- The client (CP08) can rely on the error codes above and on the four new shared schemas.
- A machine without Docker can still run `pnpm test`; only CI guarantees the integration
  suites ran.
- Any route or schema change needs `pnpm --filter @ogm/server openapi` in the same PR.
