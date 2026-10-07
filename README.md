# Offered Grade Maze

A first-person browser game set in an impossible house. Doors are seamless windows into other
rooms, but they don't always lead back the way you came. Find the **Offered Grade** diploma
(_Megajánlott jegy_) as fast as you can.

> Status: **CP01 – Foundations**. The repository, tooling and shared contracts are in place.
> The game itself arrives in later checkpoints (`docs/checkpoints/`).

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

## Commands

| Command              | What it does                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `pnpm build`         | Builds every package (Turborepo, cached)                           |
| `pnpm dev`           | Starts development servers (from CP02)                             |
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
  client/            @ogm/client: Three.js client (CP02)
e2e/                 Playwright tests (CP03, CP10)
docker/              Docker Compose files
.github/workflows/   CI
```

Start with `AGENTS.md` before contributing.
