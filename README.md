# Offered Grade Maze

A first-person browser game set in an impossible house. Doors are seamless windows into other
rooms, but they don't always lead back the way you came. Find the **Offered Grade** diploma
(_Megajánlott jegy_) as fast as you can.

> Status: **CP08 – Client integration and UI shell**. The whole player journey works:
> title, new game (random or seed), a streamed house, the goal (a placeholder box until
> CP09), and a stored result with a copyable seed. See `docs/checkpoints/`.

## Prerequisites

- **Node.js 22 or 24 LTS** (`.nvmrc` pins 22, the CI baseline; 24 is also tested in CI)
- **pnpm 9** (`corepack enable` picks up the pinned version from `package.json`)
- **Docker Desktop** (for the local PostgreSQL database)

## Getting started

```sh
corepack enable          # once per machine, provides pnpm 9.15.9
pnpm install
pnpm build
pnpm db:up               # PostgreSQL 16 on localhost:5432 (user/password/db: ogm/ogm/ogm)
pnpm test
```

Check the database:

```sh
psql postgres://ogm:ogm@localhost:5432/ogm -c 'select 1'
# or, without a local psql:
docker compose -f docker/docker-compose.dev.yml exec db psql -U ogm -c 'select 1'
```

Stop it with `pnpm db:down`. Delete its data with
`docker compose -f docker/docker-compose.dev.yml down -v`.

## Run locally (the whole product, PD4)

Needs only Docker Desktop:

```sh
pnpm start:local         # = docker compose up --build
```

Open <http://localhost:8080>. `http://localhost:8080/api/v1/health` reports
`{"status":"ok","db":"ok",…}` once the database is up. Stop with Ctrl+C (or
`docker compose down`).

**Reset data** (delete every game and result): `docker compose down -v`.

The image (`docker/Dockerfile`) builds `shared`, `generator`, `client` and `server`, and runs
the server as a non-root user. The server applies database migrations before it listens.
Configuration (environment variables of the `app` service in `docker-compose.yml`):

| Variable             | Default                                 | Meaning                         |
| -------------------- | --------------------------------------- | ------------------------------- |
| `PORT`               | `8080`                                  | HTTP port                       |
| `DATABASE_URL`       | `postgres://ogm:ogm@localhost:5432/ogm` | PostgreSQL                      |
| `LOG_LEVEL`          | `info`                                  | pino level (`silent` … `trace`) |
| `DEBUG_VIEW_ENABLED` | `true`                                  | debug endpoint (PD6)            |
| `PREFETCH_RADIUS`    | `4`                                     | door hops streamed ahead        |
| `LEVEL_CACHE_SIZE`   | `100`                                   | levels in the LRU cache         |
| `RATE_LIMIT_ENABLED` | `true`                                  | off for local load tests        |
| `CLIENT_DIST`        | `packages/client/dist`                  | built client to serve           |

## Server (dev)

```sh
pnpm db:up                                   # PostgreSQL on localhost:5432
pnpm build
pnpm --filter @ogm/server start              # http://localhost:8080 (API and built client)
pnpm --filter @ogm/server test               # integration tests on a fresh database each
pnpm --filter @ogm/server openapi            # regenerate docs/api/openapi.json
pnpm --filter @ogm/server bench:create       # POST /games timing, Hard, cache misses
pnpm --filter @ogm/server db:generate        # new migration after a schema change
```

Without a reachable database the server's integration tests are skipped with a warning
(`OGM_REQUIRE_DB=1` makes them fail instead, as in CI). The API is described in
`docs/api/openapi.json`.

## Play (dev)

```sh
pnpm install && pnpm build
pnpm db:up                                   # PostgreSQL
pnpm --filter @ogm/server start              # API on :8080
pnpm dev                                     # client on :5173, proxies /api to :8080
```

Open <http://localhost:5173>. Without a server, add `?mock=1` for the in-browser mock API on
the fixture house (dev builds only); `&latency=300` delays every response by 300 ms.
`?seed=M1-7K2Q-X9MP` opens New game with that seed. Add `&perf=1` for the performance
overlay (it also counts missing portal targets and rooms still being built). The language
(EN | HU) is on the title screen.

## Run the engine (dev)

```sh
pnpm install
pnpm dev                 # or: pnpm --filter @ogm/client dev
```

Open <http://localhost:5173/?dev=fixtures&room=r00>. Click to lock the mouse, then:

- **W A S D** move (by key position, so QWERTZ and AZERTY work too), **mouse** looks around.
- **1–6** jump to rooms r00–r05 (dev builds only).
- **Esc** releases the mouse and stops movement.
- Add `&perf=1` for the performance overlay (FPS, frame time avg/p95, draw calls, passes).
- Add `&portalDebug=1` to tint portal levels (1 red, 2 green, 3 blue) and outline them.
- Add `&quality=high` or `&quality=low` to pin portal quality (default: automatic).

**Generated houses.** <http://localhost:5173/?dev=level&file=sample-hard&room=r00> loads a
level dumped by the generator from `packages/client/src/dev/levels/`. `[` and `]` jump to the
previous and next room, **Home** to the start room. Dump your own (git-ignored) with
`pnpm gen dump <seed> --json packages/client/src/dev/levels/<name>.json`.

**Prefab gallery.** <http://localhost:5173/?dev=prefabs> shows every prefab and variant in two
colour sets. Click to look, **W A S D** to fly, **Q / E** down and up, **Shift** faster, **F**
toggles footprint outlines (the collider size). Options: `&only=sofa_3seat,bed_double`,
`&outlines=1`, `&camera=x,y,z,yaw,pitch`.

## End-to-end tests (Playwright)

```sh
pnpm --filter @ogm/e2e exec playwright install chromium   # once per machine
pnpm test:e2e            # portal checks, visual baselines, the game on the mock API
pnpm test:e2e:update     # rewrite the baselines after an intended visual change
E2E_API=1 pnpm test:e2e  # also the real-API journey (needs pnpm build and pnpm db:up)
```

Baselines are per platform. On a new platform (for example the first run on macOS) the
first run writes them and reports them as new; run it again to compare.

## Level generator CLI

```sh
pnpm gen random --difficulty hard                      # fresh seed and its summary
pnpm gen show M1-7K2Q-X9MP                             # rooms, depths, links, metrics
pnpm gen validate M1-7K2Q-X9MP                         # validator issues, or "valid"
pnpm gen dump M1-7K2Q-X9MP --json m.json --svg m.svg   # level JSON and link-graph picture
pnpm gen sweep --difficulty easy --count 10000         # validity, retry rate, timings
pnpm gen golden                                        # check the golden seeds (--write to update)
pnpm gen fixtures --write                              # re-furnish the client fixture house
```

## Commands

| Command              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `pnpm build`         | Builds every package (Turborepo, cached)                            |
| `pnpm dev`           | Starts the client dev server (http://localhost:5173)                |
| `pnpm lint`          | ESLint with type information, plus the generator determinism guard  |
| `pnpm typecheck`     | `tsc` in every package                                              |
| `pnpm test`          | Vitest; `shared` and `generator` with coverage (≥ 90 % lines)       |
| `pnpm test:prop`     | Property-based tests with 10 000 runs each                          |
| `pnpm test:e2e`      | Playwright portal and visual tests (see above)                      |
| `pnpm format`        | Formats with Prettier (`pnpm format:check` verifies)                |
| `pnpm db:up/db:down` | Starts or stops the local PostgreSQL container                      |
| `pnpm start:local`   | Builds and runs the whole product in Docker (http://localhost:8080) |
| `pnpm gen …`         | Level generator CLI (see above)                                     |

## Repository layout

```
AGENTS.md            rules for every contributor, glossary, definition of done
docs/
  architecture.md    architecture and implementation plan
  decisions.md       final product decisions PD1–PD10
  adr/               architecture decision records
  api/openapi.json   generated API description (CP07)
  checkpoints/       CP01 … CP10 work packages
packages/
  shared/            @ogm/shared: seed codec, door geometry, Zod DTOs, graph, prefab catalogue
  generator/         @ogm/generator: deterministic topology, furnishing, validator, CLI
  server/            @ogm/server: Fastify API, game sessions, PostgreSQL (Drizzle)
  client/            @ogm/client: Three.js engine and React UI shell
e2e/                 Playwright tests (CP03, CP10)
docker/              Dockerfile and the dev database compose file
docker-compose.yml   the whole product locally (pnpm start:local)
.github/workflows/   CI
```

Start with `AGENTS.md` before contributing.
