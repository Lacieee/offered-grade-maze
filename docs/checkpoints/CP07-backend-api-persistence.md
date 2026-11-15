# Checkpoint 07 — Backend API, game sessions and persistence

**Product:** Offered Grade Maze — Release 1.0
**Track:** B (platform) · **Planned dates:** Thu 29 Oct – Wed 4 Nov 2026
**Depends on:** CP05 · **Unlocks:** CP08, CP10

---

## 1. Goal

Ship the Fastify backend that creates validated games from random or typed seeds and streams rooms ahead of the player. It validates every door crossing, settles official completion times and stores anonymous results in PostgreSQL. Package the whole product as one Docker image that runs locally with Docker Compose (product decision PD4: no cloud deployment).

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). The server imports `@ogm/generator` and `@ogm/shared`; all request and response bodies use the `@ogm/shared` Zod schemas.

## 3. Scope

**In scope:** Fastify app, configuration, DB schema and migrations, level cache, game service, all `/api/v1` endpoints, neighbourhood streaming, transition validation, timing rules, debug endpoint, client error logging, expiry job, OpenAPI generation, Dockerfile, `docker-compose.yml`, integration tests.

**Out of scope:** client code (CP08), accounts, leaderboards, cloud deployment.

## 4. Requirements

### T1 — App skeleton (`packages/server`)

1. Fastify 5 with `fastify-type-provider-zod` (or an equivalent) so Zod schemas validate requests **and** responses.
2. Plugins: `@fastify/helmet` (CSP compatible with WebGL, blob workers and inline styles from React), `@fastify/rate-limit`, `@fastify/static` (serves the built client from `packages/client/dist` with `immutable` cache headers on hashed assets and `no-cache` on `index.html`; SPA fallback to `index.html` for non-API GET routes).
3. Configuration from environment (validated with Zod at start):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8080 | HTTP port |
| `DATABASE_URL` | `postgres://ogm:ogm@localhost:5432/ogm` | PostgreSQL |
| `LOG_LEVEL` | `info` | pino level |
| `DEBUG_VIEW_ENABLED` | `true` | PD6: enabled in release builds |
| `PREFETCH_RADIUS` | 4 | door hops streamed ahead |
| `LEVEL_CACHE_SIZE` | 100 | levels in the LRU cache |
| `RATE_LIMIT_ENABLED` | `true` | can be disabled for local load tests |

4. Error format for every non-2xx response: `{ "error": { "code": "<machine_code>", "message": "<English text>" } }`. Never leak stack traces.
5. Structured pino logs with request ids. Log events: `game.created` (seed, difficulty, attempts, generation ms), `game.generation_failed`, `game.desync`, `game.completed` (time, source, transitions, debugUsed).

### T2 — Database (Drizzle ORM + drizzle-kit, PostgreSQL 16)

Migrations run automatically at server start, before listening.

```
games
  id uuid PK                       seed_code text not null
  difficulty text not null         generator_version int not null
  level_hash text not null         status text not null  -- created | started | completed | expired
  current_room text not null       last_seq int not null default 0
  sent_rooms text[] not null       debug_used boolean not null default false
  integrity text not null default 'ok'   -- ok | desync
  created_at timestamptz not null default now()
  started_at timestamptz           completed_at timestamptz

results
  id uuid PK                       game_id uuid unique references games(id)
  seed_code text not null          difficulty text not null
  generator_version int not null   completion_ms int not null
  time_source text not null        -- client | server
  transitions int not null         debug_used boolean not null
  integrity text not null          completed_at timestamptz not null
  index (seed_code), index (difficulty, completion_ms)

game_transitions
  game_id uuid references games(id)   seq int        PK (game_id, seq)
  from_room text  door text  to_room text  client_elapsed_ms int  server_at timestamptz
```

No personal data: do not store IP addresses or user agents.

### T3 — Level cache and neighbourhood

1. `LevelCache`: LRU keyed by canonical seed code. On a miss: `generateLevel(seed)` then `validateLevel(level)`; never cache or serve an invalid level.
2. When a game's level is regenerated (cache miss for an existing game), compare `levelHash` with `games.level_hash`. A mismatch logs `game.level_drift` at error level and returns 500 for that game.
3. `neighbourhood(level, roomId, radius)`: all rooms reachable from `roomId` by following **outgoing** links within `radius` hops, including `roomId` itself, sorted by id.

### T4 — Endpoints (`/api/v1`)

| Method and path | Behaviour |
| --- | --- |
| `POST /games` | Body `CreateGameRequest`. `random`: payload from `crypto.randomBytes(5)`, version 1, the requested difficulty; if generation fails after 64 attempts, silently draw a new seed (max 5 times, then 503). `seed`: `parseSeed`; format errors → 400 `invalid_seed`; unsupported version → 422 `unsupported_version`; generation failure → 422 `seed_not_playable`. Insert a `games` row (`status = created`, `current_room = start`, `sent_rooms = neighbourhood(start, R)`). Respond 201 `CreateGameResponse` with those rooms. Rate limit 20/min per IP. |
| `POST /games/:id/start` | Sets `status = started`, `started_at = now()` if not already started (idempotent: returns the stored `startedAt`). 404 unknown game, 409 `already_completed`. |
| `POST /games/:id/transitions` | Body `TransitionRequest`. See T5. Rate limit 20/s per game. |
| `POST /games/:id/complete` | Body `CompleteRequest`. See T6. |
| `GET /games/:id/rooms?ids=r01,r07` | Returns the requested `RoomDTO`s only if each id is in `sent_rooms` ∪ `neighbourhood(current_room, R)`; otherwise 403 `room_not_available`. Max 24 ids. |
| `GET /games/:id/debug` | Only if `DEBUG_VIEW_ENABLED`; else 404. Sets `games.debug_used = true`. Returns `DebugResponse`: all rooms as `DebugRoomDTO` (with depth, `onSpine`, `twinOf`), metrics, `levelHash`, start, goal, current, and `pathFromStart` / `pathFromCurrent` from `@ogm/shared` `shortestPath`. |
| `POST /client-errors` | `{ message, stack?, context? }` (max 8 kB) → logged at warn level; 204. Rate limit 10/min per IP. |
| `GET /health` | `{ status: 'ok', db: 'ok' | 'down', version }`. |

### T5 — Transition validation

Process inside one DB transaction with `SELECT … FOR UPDATE` on the game row:

1. The game must be `started`; otherwise 409 `not_started` (or `already_completed`).
2. If `seq <= last_seq` and a stored transition with that `seq` exists, return the stored outcome (idempotent replay) with `rooms: []`.
3. Accept if `seq === last_seq + 1`, `from === current_room`, the door exists in `from` and has a link. Set `current_room = link.room`, `last_seq = seq`, store the transition, compute `newRooms = neighbourhood(current, R)` minus `sent_rooms`, append them to `sent_rooms`, and respond `{ seq, current, rooms: newRooms }`.
4. Any other case: set `integrity = 'desync'`, log `game.desync` with details, and respond 409 `{ error: { code: 'desync', … }, current, lastSeq }`. The game remains playable.

### T6 — Completion and timing

1. Requires `status = started`, `lastSeq === last_seq` (the client flushed its queue) and `current_room === goal_room`; otherwise 409 `not_at_goal` / `pending_transitions`.
2. `serverElapsed = now − started_at` (ms). Official time: if `0 ≤ serverElapsed − clientElapsedMs ≤ 5000`, use `clientElapsedMs` with `timeSource = 'client'`; otherwise use `serverElapsed` with `timeSource = 'server'`.
3. `debugUsed = request.debugUsed || games.debug_used`.
4. In one transaction: set the game `completed`, insert `results`, return `CompleteResponse`. Repeated calls return the same result (idempotent).
5. PD1: the server never pauses the clock.

### T7 — Expiry job

Every hour (in-process `setInterval`, guarded against overlap): mark games with `status = started` and `started_at` older than 24 h as `expired`. Delete `game_transitions` of games that ended (completed or expired) more than 30 days ago. Games stuck in `created` for 24 h are deleted.

### T8 — OpenAPI

Generate `docs/api/openapi.json` from the route schemas at build time (`pnpm --filter @ogm/server openapi`). CI fails if the committed file is out of date.

### T9 — Local packaging (PD4)

1. `docker/Dockerfile`: multi-stage. Builder: install with pnpm, build `shared`, `generator`, `client` and `server`. Runtime: `node:22-slim`, non-root user, copies the server bundle, production node_modules and `client/dist`. `HEALTHCHECK` on `/api/v1/health`.
2. `docker-compose.yml` at the repo root: `db` (postgres:16, named volume, health check) and `app` (built from the Dockerfile, depends on a healthy `db`, port `8080:8080`).
3. `pnpm start:local` = `docker compose up --build`. The game is then available at `http://localhost:8080`.
4. README section "Run locally" with these steps plus "reset data" (`docker compose down -v`).

## 5. Acceptance criteria

- [ ] Integration tests (Vitest + `fastify.inject` + a real PostgreSQL from `docker-compose.dev.yml` or Testcontainers) cover every endpoint: happy paths; 400/404/409/422 cases; idempotent `/start`, `/transitions` (replayed `seq`) and `/complete`; desync flagging; `not_at_goal`; both time-source branches; the `/rooms` 403 rule; debug disabled → 404.
- [ ] A scripted API playthrough (test) follows `pathFromStart` from `/debug` with transitions and completes a game on each difficulty; the stored `results` row is correct.
- [ ] Neighbourhood test: after every transition in that playthrough, the client-side cache (union of all returned rooms) contains every room within 4 hops of the current room.
- [ ] Typed seed reproducibility: creating two games with the same seed returns identical `rooms` for the start neighbourhood and identical `level_hash`.
- [ ] `POST /games` p95 < 300 ms for Hard on the M1 Max (cache miss), measured in a test script.
- [ ] `pnpm start:local` on a clean machine with Docker Desktop brings up the app at `http://localhost:8080` (serving the current client build) and `/api/v1/health` returns `db: ok`.
- [ ] Database contains no IP addresses or user agents (schema review in PR).
- [ ] `docs/api/openapi.json` is generated and up to date.
