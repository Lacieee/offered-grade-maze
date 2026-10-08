# Offered Grade Maze

A first-person browser game set in an impossible house. Doors are seamless windows into other
rooms, but they don't always lead back the way you came. Find the **Offered Grade** diploma
(_Megajánlott jegy_) as fast as you can.

> Status: **CP03 – Portal rendering**. Every doorway of the six-room fixture house is a live,
> seamless window into the room it leads to, and you can walk through. See
> `docs/checkpoints/`.

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

## End-to-end tests (Playwright)

```sh
pnpm --filter @ogm/e2e exec playwright install chromium   # once per machine
pnpm test:e2e            # portal checks and visual baselines (starts its own dev server)
pnpm test:e2e:update     # rewrite the baselines after an intended visual change
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

| Command              | What it does                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `pnpm build`         | Builds every package (Turborepo, cached)                           |
| `pnpm dev`           | Starts the client dev server (http://localhost:5173)               |
| `pnpm lint`          | ESLint with type information, plus the generator determinism guard |
| `pnpm typecheck`     | `tsc` in every package                                             |
| `pnpm test`          | Vitest; `shared` and `generator` with coverage (≥ 90 % lines)      |
| `pnpm test:prop`     | Property-based tests with 10 000 runs each                         |
| `pnpm test:e2e`      | Playwright portal and visual tests (see above)                     |
| `pnpm format`        | Formats with Prettier (`pnpm format:check` verifies)               |
| `pnpm db:up/db:down` | Starts or stops the local PostgreSQL container                     |
| `pnpm gen …`         | Level generator CLI (see above)                                    |

## Repository layout

```
AGENTS.md            rules for every contributor, glossary, definition of done
docs/
  architecture.md    architecture and implementation plan
  decisions.md       final product decisions PD1–PD10
  adr/               architecture decision records
  checkpoints/       CP01 … CP10 work packages
packages/
  shared/            @ogm/shared: seed codec, door geometry, Zod DTOs, graph, prefab catalogue
  generator/         @ogm/generator: deterministic topology, furnishing, validator, CLI
  server/            @ogm/server: Fastify backend (CP07)
  client/            @ogm/client: Three.js engine and React UI shell
e2e/                 Playwright tests (CP03, CP10)
docker/              Docker Compose files
.github/workflows/   CI
```

Start with `AGENTS.md` before contributing.
