# Offered Grade Maze

A first-person browser game set in an impossible house. Doors are seamless windows into other
rooms, but they don't always lead back the way you came. Find the **Offered Grade** diploma
(_Megajánlott jegy_) as fast as you can.

> Status: **CP02 – Client engine core**. You can walk around a six-room fixture house
> (doors are not see-through yet; portals arrive in CP03). See `docs/checkpoints/`.

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
- Add `&perf=1` for the performance overlay (FPS, frame time avg/p95, draw calls).

## Commands

| Command              | What it does                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `pnpm build`         | Builds every package (Turborepo, cached)                           |
| `pnpm dev`           | Starts the client dev server (http://localhost:5173)               |
| `pnpm lint`          | ESLint with type information, plus the generator determinism guard |
| `pnpm typecheck`     | `tsc` in every package                                             |
| `pnpm test`          | Vitest; `shared` and `generator` with coverage (≥ 90 % lines)      |
| `pnpm test:prop`     | Property-based tests with 10 000 runs each                         |
| `pnpm format`        | Formats with Prettier (`pnpm format:check` verifies)               |
| `pnpm db:up/db:down` | Starts or stops the local PostgreSQL container                     |

## Repository layout

```
AGENTS.md            rules for every contributor, glossary, definition of done
docs/
  architecture.md    architecture and implementation plan
  decisions.md       final product decisions PD1–PD8
  adr/               architecture decision records
  checkpoints/       CP01 … CP10 work packages
packages/
  shared/            @ogm/shared: seed codec, door geometry, Zod DTOs
  generator/         @ogm/generator: deterministic PRNG (level generation from CP04)
  server/            @ogm/server: Fastify backend (CP07)
  client/            @ogm/client: Three.js engine and React UI shell
e2e/                 Playwright tests (CP03, CP10)
docker/              Docker Compose files
.github/workflows/   CI
```

Start with `AGENTS.md` before contributing.
