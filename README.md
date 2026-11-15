# Offered Grade Maze

A first-person browser game set in an impossible house. Doors are seamless windows into other
rooms, but they don't always lead back the way you came: some doors lead somewhere else, some
rooms lead into themselves, and the same room can be reached through several doors. Find the
**Offered Grade** diploma (_Megajánlott jegy_) as fast as you can. Every house comes from a
seed you can share, so a friend can race you through the same house.

Version **1.0.0** (see [CHANGELOG.md](CHANGELOG.md)). English and Hungarian.

The full source code is available on GitHub:
[https://github.com/Lacieee/offered-grade-maze](https://github.com/Lacieee/offered-grade-maze).

## Screenshots

Captured from the local development build using the fixture house and a generated sample house.

| Title screen                                                                                   | Seamless portal view                                                                                       |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ![Title screen with New game and Settings](docs/screenshots/01-title-screen.png)               | ![Living room with a live view into the kitchen through a doorway](docs/screenshots/02-portal-view.png)    |
| **The Offered Grade**                                                                          | **Debug map and solution path**                                                                            |
| ![Glowing Offered Grade diploma seen through a doorway](docs/screenshots/03-offered-grade.png) | ![Debug view showing room connections and the guaranteed solution path](docs/screenshots/04-debug-map.png) |

## Requirements

- **To play:** a Mac with **Docker Desktop** (or any machine with Docker), and a desktop
  browser with WebGL2: Chrome, Safari, Firefox or Edge.
- **To develop:** Node.js 22 or 24 LTS, pnpm 9 (`corepack enable`), and Docker Desktop (or
  PostgreSQL 16 of your own).

## Run locally

```sh
git clone https://github.com/Lacieee/offered-grade-maze.git
cd offered-grade-maze
pnpm start:local          # = docker compose up --build
```

Open **<http://localhost:8080>**. The first build takes a few minutes. Stop with Ctrl+C or
`docker compose down`; your results stay in the database volume.

Without pnpm: `docker compose up --build` does the same.

## How to play

1. **New game**: pick Easy, Medium or Hard for a random house, or enter a seed.
2. Click the Ready screen. The timer starts and never pauses, not even in the pause overlay
   or the debug view.
3. Walk into the glowing diploma to finish. The result screen shows your time and the seed.

| Control                 | Action                                                                         |
| ----------------------- | ------------------------------------------------------------------------------ |
| **W A S D**             | Move (by key position, so QWERTZ and AZERTY work too)                          |
| **Mouse**               | Look around (click the game to lock the mouse)                                 |
| **Esc**                 | Release the mouse (pause overlay; the timer keeps running)                     |
| **\`** / **§** / **F9** | Debug view: the key under Esc (ANSI \` or Apple ISO §), or F9 (fn+F9 on a Mac) |

**Sharing seeds.** The result screen's **Copy** puts the seed (for example `M1-7K2Q-X9MP`) on
the clipboard. Anyone can type it under New game → Enter seed, or open
`http://localhost:8080/?seed=M1-7K2Q-X9MP`. The letter is the difficulty, the digit the
generator version. **Play this seed again** replays the same house.

**Debug view.** Shows the house's real graph: every room, every door and where it leads,
the start (green), the goal (gold), where you are (blue), and the guaranteed path from here
or from the start. Opening it marks the result "debug view used" (the result still counts).
It can be switched off on the server with `DEBUG_VIEW_ENABLED=false`.

**Settings** (title screen or pause overlay): language, mouse sensitivity, invert Y, field of
view, head bob, volumes, graphics quality.

## Resetting data

Delete every game and result: `docker compose down -v` (then `pnpm start:local` again).

## Troubleshooting

- **"Your browser cannot run the game" / a black screen:** the game needs WebGL2. Make sure
  hardware acceleration is on (Chrome: Settings → System; Safari is fine by default) and the
  browser is up to date.
- **The mouse does not lock:** click inside the game once more. Browsers refuse a new lock for
  about a second after Esc. Safari has no raw mouse input (`unadjustedMovement`); the game
  falls back to the normal lock there.
- **No sound:** sound starts with the Ready click. Check the volumes in Settings, and that
  the tab is not muted.
- **Slow or stuttering:** Settings → Graphics quality → Low, or add `?perf=1` to the address
  to see the frame rate.
- **Port 8080 is taken:** change `ports` in `docker-compose.yml` (for example `"8081:8080"`).
- **The house will not load / "server unreachable":** `docker compose ps` should show the
  `app` and `db` services healthy; `http://localhost:8080/api/v1/health` reports the database.

## Configuration

The image (`docker/Dockerfile`) builds `shared`, `generator`, `client` and `server`, and runs
the server as a non-root user. The server applies database migrations before it listens.
Environment variables of the `app` service in `docker-compose.yml`:

| Variable             | Default                                 | Meaning                                        |
| -------------------- | --------------------------------------- | ---------------------------------------------- |
| `PORT`               | `8080`                                  | HTTP port                                      |
| `DATABASE_URL`       | `postgres://ogm:ogm@localhost:5432/ogm` | PostgreSQL                                     |
| `LOG_LEVEL`          | `info`                                  | pino level (`silent` … `trace`)                |
| `DEBUG_VIEW_ENABLED` | `true`                                  | the debug view's endpoint (PD6); `false` → 404 |
| `PREFETCH_RADIUS`    | `4`                                     | door hops streamed ahead                       |
| `LEVEL_CACHE_SIZE`   | `100`                                   | levels in the LRU cache                        |
| `RATE_LIMIT_ENABLED` | `true`                                  | off for local load tests                       |
| `CLIENT_DIST`        | `packages/client/dist`                  | built client to serve                          |

## Development

```sh
corepack enable          # once per machine, provides pnpm 9.15.9
pnpm install
pnpm build
pnpm db:up               # PostgreSQL 16 on localhost:5432 (user/password/db: ogm/ogm/ogm)
pnpm test
```

Check the database with `psql postgres://ogm:ogm@localhost:5432/ogm -c 'select 1'` (or
`docker compose -f docker/docker-compose.dev.yml exec db psql -U ogm -c 'select 1'`). Stop it
with `pnpm db:down`; delete its data with `docker compose -f docker/docker-compose.dev.yml down -v`.

### Server (dev)

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

### Play (dev)

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

**Settings** (title screen or pause overlay): language, mouse sensitivity, invert Y, field of
view, head bob, master / music / effects volume and graphics quality. They apply at once and
are kept in `localStorage` (`ogm.settings`; the language in `ogm.lang`). `?quality=` in the
URL overrides the quality setting.

**Sound** is synthesised with Web Audio and starts with the click on the Ready screen:
footsteps by floor type, a quiet ambient bed, a hum from the Offered Grade that you can
follow through doorways, and a stinger at the pickup.

### Run the engine (dev)

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

### End-to-end tests (Playwright)

```sh
pnpm --filter @ogm/e2e exec playwright install chromium   # once per machine
pnpm test:e2e            # portal checks, visual baselines, the goal, sound, settings, the game
pnpm test:e2e:update     # rewrite the baselines after an intended visual change
E2E_API=1 pnpm test:e2e  # also the real API: playthroughs, debug view, seed replay, release build
E2E_API=1 E2E_LONG=1 pnpm test:e2e robustness   # 100 autopilot games with 300 ms latency (~1 h)
```

The autopilot (`window.__ogm.autopilot.followPath()` in dev builds; in release builds only
with `?autopilot=1`) plays through the normal controls along the debug view's path.

`goal.spec.ts` measures that the Offered Grade is the brightest object from every door of
the goal room and through doorways (portal levels 1 and 2); the screenshots land in
`e2e/test-results/`. `GOAL_HOUSES=sample-easy,my-level pnpm test:e2e goal` runs it on other
dumped levels.

Baselines are per platform. On a new platform (for example the first run on macOS) the
first run writes them and reports them as new; run it again to compare.

### Performance walk (release check, CP10 B1)

On the reference machine (MacBook Pro M1 Max), with the product running (`pnpm start:local`):

```sh
pnpm size                # the client's JavaScript, gzipped, against the 600 kB budget
pnpm perf:walk           # Chrome: 3-minute autopilot walk on a Hard seed, Auto and Low quality
PERF_CHANNEL=msedge pnpm perf:walk                  # the same in Edge
```

The logs (average FPS, p95 frame time, passes, missing portal targets, shader compiles after
a room's first visit) land in `e2e/perf-results/`. For Safari and Firefox, open
`http://localhost:8080/?perf=1&autopilot=1&seed=H1-7K2Q-X9MP`, start the game, run
`await __ogm.autopilot.tour(180)` in the console, then click **Copy log** in the perf panel
(see `docs/release/browser-checklist.md`).

### Level generator CLI

```sh
pnpm gen random --difficulty hard                      # fresh seed and its summary
pnpm gen show M1-7K2Q-X9MP                             # rooms, depths, links, metrics
pnpm gen validate M1-7K2Q-X9MP                         # validator issues, or "valid"
pnpm gen dump M1-7K2Q-X9MP --json m.json --svg m.svg   # level JSON and link-graph picture
pnpm gen sweep --difficulty easy --count 10000         # validity, retry rate, timings
pnpm gen golden                                        # check the golden seeds (--write to update)
pnpm gen fixtures --write                              # re-furnish the client fixture house
```

### Commands

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
| `pnpm size`          | Client bundle size against the 600 kB (gzip) budget                 |
| `pnpm perf:walk`     | Performance walk in a real browser (see above)                      |

## Repository layout

```
AGENTS.md            rules for every contributor, glossary, definition of done
docs/
  architecture.md    architecture and implementation plan
  decisions.md       final product decisions PD1–PD10
  adr/               architecture decision records
  release/           release checklists, traceability, sweep report (CP10)
  api/openapi.json   generated API description (CP07)
  checkpoints/       CP01 … CP10 work packages
packages/
  shared/            @ogm/shared: seed codec, door geometry, Zod DTOs, graph, prefab catalogue
  generator/         @ogm/generator: deterministic topology, furnishing, validator, CLI
  server/            @ogm/server: Fastify API, game sessions, PostgreSQL (Drizzle)
  client/            @ogm/client: Three.js engine and React UI shell
e2e/                 Playwright tests and the performance walk (CP03 … CP10)
docker/              Dockerfile and the dev database compose file
docker-compose.yml   the whole product locally (pnpm start:local)
.github/workflows/   CI
```

Start with `AGENTS.md` before contributing.
