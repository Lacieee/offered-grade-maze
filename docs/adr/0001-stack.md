# ADR-0001: Technology stack and pinned versions

- **Status:** accepted
- **Date:** 2026-10-07
- **Checkpoint / task:** CP01-T1

## Context

`docs/architecture.md` §5 chooses a mainstream, strictly typed TypeScript stack so that AI
agents work from strong prior knowledge and compiler feedback. CP01 requires exact pinned
versions, recorded here.

## Decision

All versions are pinned exactly in `package.json` (no `^`/`~`) and locked in `pnpm-lock.yaml`.
We pick the newest release that was at least two weeks old when CP01 started and that is
compatible with the rest of the toolchain.

| Area            | Package                     | Version     | Notes                                                    |
| --------------- | --------------------------- | ----------- | -------------------------------------------------------- |
| Runtime         | Node.js                     | 22 / 24 LTS | `.nvmrc` = 22; `engines` `^22.12 \|\| ^24`; CI runs both |
| Package manager | pnpm                        | 9.15.9      | `packageManager` field; workspaces                       |
| Task runner     | turbo                       | 2.11.2      | cached `build`, `lint`, `typecheck`, `test`              |
| Language        | typescript                  | 6.0.3       | see "TypeScript 6, not 7" below                          |
| Lint            | eslint                      | 10.11.0     | flat config                                              |
| Lint            | @eslint/js                  | 10.0.1      |                                                          |
| Lint            | typescript-eslint           | 8.70.1      | `strictTypeChecked`, project service                     |
| Lint            | eslint-config-prettier      | 10.1.8      |                                                          |
| Lint            | globals                     | 17.12.0     |                                                          |
| Format          | prettier                    | 3.9.8       | single quotes, trailing commas, 100 columns              |
| Unit tests      | vitest, @vitest/coverage-v8 | 4.1.11      | see "Vitest 4, not 5" below                              |
| Property tests  | fast-check                  | 4.10.2      |                                                          |
| Schemas / DTOs  | zod                         | 4.6.5       | `z.toJSONSchema` feeds Fastify and OpenAPI later         |
| Node types      | @types/node                 | 22.20.4     | matches the Node 22 runtime                              |
| Database (dev)  | postgres (Docker image)     | 16          | `docker/docker-compose.dev.yml`                          |

### Added in CP02 (client)

| Area     | Package                   | Version | Notes                                  |
| -------- | ------------------------- | ------- | -------------------------------------- |
| 3D       | three, @types/three       | 0.186.0 | WebGL2 renderer, `BufferGeometryUtils` |
| UI shell | react, react-dom          | 18.3.1  | menus and overlays only                |
| UI types | @types/react              | 18.3.31 |                                        |
| UI types | @types/react-dom          | 18.3.7  |                                        |
| UI state | zustand                   | 5.0.15  |                                        |
| Build    | vite                      | 7.3.6   | see "Vite 7, not 8" below              |
| Build    | @vitejs/plugin-react      | 5.2.0   | last line that supports Vite 7         |
| Lint     | eslint-plugin-react-hooks | 7.1.1   | `.tsx` files in the client             |

#### Vite 7, not 8

Vite 8 switched its bundler to Rolldown and `@vitejs/plugin-react` 6 requires it. Vite 7.3
is the mature line, is supported by Vitest 4.1, and is all CP02–CP10 need. Revisit after
Release 1.0.

### Added in CP03 (e2e)

| Area      | Package             | Version      | Notes                                      |
| --------- | ------------------- | ------------ | ------------------------------------------ |
| E2E tests | @playwright/test    | 1.56.1       | Chromium 141, SwiftShader WebGL (ADR-0003) |
| E2E tests | pngjs, @types/pngjs | 7.0.0, 6.0.5 | frame-difference metrics                   |

Packages added by later checkpoints (Three.js, React, Vite, Fastify, Drizzle, Playwright…) are
pinned the same way and appended to this table in the PR that introduces them.

### Node.js 22 and 24

The checkpoints name Node.js 22 LTS. The product owner's Mac runs Node.js 24 (the current
Active LTS), and every dependency supports it, so `engines` accepts both `^22.12.0` and
`^24.0.0`. `.nvmrc` stays on 22 as the baseline, and CI runs the full check on both versions.

### TypeScript 6, not 7

TypeScript 7.0 (the native port) is available, but `typescript-eslint` 8.x supports only
TypeScript `>=4.8.4 <6.1.0`. Type-aware linting is a core guard rail for agent work, so we use
TypeScript 6.0.3. Revisit when `typescript-eslint` supports 7.x.

### Vitest 4, not 5

Vitest 5.0 was less than three weeks old at CP01. Vitest 4.1.11 is the mature line and
supports everything CP01–CP10 need. Revisit after Release 1.0.

### Workspace package resolution

Workspace packages export their compiled `dist/` (`exports` → `dist/index.js` and `.d.ts`).
Turbo runs `^build` before `typecheck`, `lint` and `test`, so dependents always see fresh
declarations. The client switches to Vite's bundler resolution in CP02.

## Consequences

- Reproducible installs on every machine and in CI (`pnpm install --frozen-lockfile`).
- Upgrades are deliberate PRs that update this table.

## Alternatives considered

- **npm or Yarn workspaces:** slower installs and weaker workspace isolation than pnpm.
- **Nx instead of Turborepo:** more features than four packages need.
- **TypeScript project references:** extra configuration with little benefit at this size.
