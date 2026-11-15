# Megajánlott jegy — Architecture & Implementation Plan (Release 1.0)

Oct 7, 2026 · @Laszlo

## 1. Executive summary

Release 1.0 ships in 6 weeks (Mon 12 Oct to Fri 20 Nov 2026) as a TypeScript monorepo: a Three.js browser client, a Node.js backend that owns generation, validation and results, and PostgreSQL for anonymous result storage. The plan is risk-first: the portal renderer (the product's #1 priority and biggest technical risk) is proven with hand-authored rooms in week 1, before any procedural generation is wired in.

The work is designed for AI coding agents with a human product owner. Every task in section 21 has an ID, dependencies and testable acceptance criteria. Four human review gates cover what an agent cannot judge alone: how seamless the portals feel, how confusing the house is, and how the game sounds.

The central correctness idea is a **depth-layered topology**. Every room gets a target depth (its intended shortest distance from the start). Doors may move forward by at most one layer, but may jump back any distance. Every room has at least one forward door. These two rules make each generated house solvable from every room, with a guaranteed minimum solution length, by construction. An independent graph validator then re-checks every level before it is served.

### Key decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | TypeScript everywhere (client, server, shared package) | One language for agents. Shared DTO schemas, seed codec and door geometry run identically on both sides. |
| D2 | Three.js + WebGL2, render-target portals with oblique near-plane clipping | Seamless see-through doors with recursion. Simpler and more robust in Three.js than stencil portals. |
| D3 | Generation and validation run only on the backend | Matches spec §18. The client never imports the generator. |
| D4 | Depth-layered constructive generator plus independent validator | Solvability is guaranteed by construction and proven by a separate check (spec §9). |
| D5 | Integer-only generator math, sub-seeded PRNG streams | Seeds reproduce bit-identically across machines and releases (spec §5). |
| D6 | Seed code carries difficulty and generator version, e.g. `M1-7K2Q-X9MP` | A typed seed alone reproduces the level (spec §6). |
| D7 | Neighbourhood streaming: the client always holds every room within 4 door hops | Doorways are never empty, even with seconds of network delay (spec §17). |
| D8 | Server validates every door transition and the pickup | Stored results are trustworthy without user accounts. |
| D9 | All furniture and all audio generated procedurally in code | No asset pipeline or licensing work. Fits the low-poly style and AI development. |
| D10 | One Docker image serves the static client and the API; managed PostgreSQL | One deployable unit, same origin, no CORS. |

## 2. Release 1.0 scope, assumptions and resolved decisions

Release 1.0 delivers all 28 success criteria of spec §23 and nothing from the §24 exclusion list. Section 22 maps each criterion to the components and tasks that satisfy it.

### In scope

- Desktop browser game, first-person, WASD + mouse with Pointer Lock.
- Three difficulty levels: Easy, Medium, Hard.
- Random-seed and typed-seed game start.
- Six room types: living room, kitchen, bedroom, bathroom, hallway, study.
- Seamless recursive portals, asymmetric, one-way and self-linking doors.
- Procedural low-poly furniture, per-room identity and signature landmarks.
- Footsteps per floor type, ambient score, spatial goal hum, completion sound.
- Toggleable admin/debug graph view with the guaranteed solution path.
- Server-validated timing; anonymous, persistent results; result screen with copyable seed.

### Out of scope for 1.0

Combat, enemies, inventory, story, accounts, leaderboards, mobile and touch controls, gamepad, player-modifiable objects (the state model is ready for them, see 10.6), localisation beyond Hungarian and English strings, and multiplayer.

### Assumptions (product owner may override)

| ID | Assumption |
| --- | --- |
| A1 | Development is done by AI coding agents (for example Claude Code), with one human product owner who reviews pull requests and runs the four playtest gates. Budget about 1 hour of human time per working day, plus 2 hours per gate. |
| A2 | Up to two agent work streams can run in parallel (client track, server track). With one stream the plan stretches to about 8 weeks. |
| A3 | UI text is Hungarian by default, all strings live in one i18n file with an English copy. |
| A4 | Target: current desktop Chrome, Edge, Firefox and Safari 17+, WebGL2 required. Unsupported browsers get a clear message. |
| A5 | Hosting: one container platform plus managed PostgreSQL, EU region. |
| A6 | The timer does not pause (no pause on Esc, tab switch or debug view). This keeps server-side time validation simple and fair. |
| A7 | The goal is collected by walking into it. No interaction key exists, because spec §13 defines only WASD + mouse. |
| A8 | Using the debug view does not invalidate a result, but the result is flagged `debug_used = true`. |

### Product decisions taken by architecture

- **One-way door** = an arrival door that is sealed from the inside. From room A, door D shows room B through it. After stepping through, the player turns and sees a closed, unopenable door panel in B.
- **Self-link** = a door that leads into another door of the same room. A door never links to itself.
- **All doorways have identical dimensions** (1.0 m wide, 2.1 m high), so any door can connect to any door.
- **Rooms have flat floors at the same height.** No stairs, slopes or multi-storey layouts in 1.0.

## 3. Glossary and domain model

Every agent and every code identifier uses these terms exactly. Hungarian spec terms are given where they differ.

| Term | Code name | Meaning |
| --- | --- | --- |
| House | `Level` | The full generated structure for one seed: rooms, doors, links, start, goal. Immutable once generated. |
| Room (helyiség) | `Room` | A concrete room with a stable ID (`r00`…`r23`), type, footprint, palette, furniture and doors. One identity no matter how it is reached. |
| Room type | `RoomType` | `living`, `kitchen`, `bedroom`, `bathroom`, `hallway`, `study`. Several rooms may share a type. |
| Door slot | `Door` | A physical doorway in a wall of one room. ID unique within the room (`d0`…`d3`). |
| Link | `Link` | Directed connection `(room, door) → (targetRoom, targetDoor)`. Each door has at most one outgoing link. The reverse direction is independent (spec §7). |
| Sealed door | `link = null` | A door with no outgoing link. Rendered as a closed panel. Creates one-way connections. |
| Reciprocal pair | derived | Two links that point at each other's doors. Feels like a normal door. |
| Asymmetric link | derived | A link whose target door leads somewhere other than back. |
| Self-link | derived | A link whose target room is the same room (via a different door). |
| Portal | `Portal` (client) | The rendered view through a door with a link. |
| Depth | `depth` | A room's intended shortest door-distance from the start. Start = 0, goal = L. |
| Spine | `spine` | The rooms r0 (start) … rL (goal) that form one guaranteed shortest solution. |
| Decoy room | derived | Any room not on the spine. Feeds misleading routes (félrevezető útvonalak). |
| Twin room | `twinOf` | A decoy that deliberately copies the type, palette and main furniture of another room, but keeps its own signature landmark. |
| Signature | `signature` | A furniture item unique to one room in the house (for example a painting with a unique pattern). Makes every room distinguishable. |
| Goal | `goal` | The Megajánlott jegy object, placed in the goal room. |
| Game | `Game` | One play session on the server: seed, current room, transitions, timing, status. |
| Result | `Result` | The stored record of a completed game. |
| Seed code | `SeedCode` | The human-readable seed string, for example `M1-7K2Q-X9MP`. |

### Domain relationships

- A `Level` has 8 to 24 `Room`s, exactly one start room and one goal room (different rooms).
- A `Room` has 1 to 4 `Door`s. Each `Door` has 0 or 1 outgoing `Link`. Any number of links may arrive at the same door.
- A `Game` references exactly one `Level` through its seed code and generator version. It has 0 or 1 `Result`.
- For reachability, a player's state is just the current room. There are no keys or items, and inside a room every unsealed door is usable.

## 4. System architecture

The system has three runtime parts (browser client, Node.js server, PostgreSQL) and a shared TypeScript package both sides import. The generator is a separate package used only by the server, matching the responsibility split of spec §18.

&#91;embedded content: system architecture · client, server, database, shared package\]

The browser never generates or validates anything: it receives ready-made rooms and reports each door it walks through. Server-side, every level passes from the cache through the generator and validator before a game can use it.

### Request flow of one game

1. `POST /games`: the server decodes the seed, takes the level from the cache or generates and validates it, stores a `games` row and returns the start room's neighbourhood.
2. The client builds and compiles those rooms. On the first click the player gains control and `POST /start` records the server start time.
3. Each door crossing happens instantly in the browser. The event is queued to `POST /transitions`; the server checks it against the level and returns any newly needed rooms.
4. On pickup, `POST /complete`: the server confirms the current room is the goal room, settles the official time and stores the result.

## 5. Technology stack

The stack is mainstream, well documented and strictly typed, so AI agents work from strong prior knowledge and compiler feedback. Pin exact versions in the lockfile at the start of Phase 0 and record them in `docs/adr/0001-stack.md`.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict mode), Node.js 22 LTS | One language end to end; strict types catch contract drift. |
| Monorepo | pnpm workspaces + Turborepo | Fast installs, cached builds and tests per package. |
| 3D | Three.js (current stable release) | Mature WebGL2 renderer with render targets and custom shaders. |
| Client build | Vite | Fast dev server, small production bundle. |
| Client UI shell | React 18 + Zustand | Menus, HUD, result screen and debug overlay only. The game loop stays outside React. |
| Audio | Web Audio API, small in-house wrapper | Procedural synthesis and spatial panning without extra dependencies. |
| Server framework | Fastify 5 | Fast, schema-first, simple plugin model. |
| Validation / DTOs | Zod (in `shared`), converted to JSON Schema for Fastify | One schema validates on both sides and documents the API. |
| Database | PostgreSQL 16 | Durable result storage, managed offerings everywhere. |
| ORM / migrations | Drizzle ORM + drizzle-kit | Type-safe SQL, plain migration files. |
| Logging | pino (Fastify default) | Structured JSON logs with request IDs. |
| Unit / property tests | Vitest + fast-check | Fast, with property-based testing for the generator. |
| End-to-end tests | Playwright (Chromium with SwiftShader WebGL) | Scripted playthroughs and screenshot comparison. |
| Lint / format | ESLint (typescript-eslint strict) + Prettier | Uniform code across agent sessions. |
| CI | GitHub Actions | Lint, type check, tests, 10 000-seed generator sweep, image build. |
| Packaging | Docker (multi-stage), docker-compose for local dev | One image runs everywhere. |

No game engine (Unity, Godot, Babylon) is used. Custom portal rendering needs low-level control of cameras and projection matrices, which Three.js exposes directly.

## 6. Repository structure and conventions for AI agents

One repository, four packages. Dependencies flow one way: `client` and `server` depend on `shared`; `server` depends on `generator`; `client` never depends on `generator`.

```
megajanlott-jegy/
  AGENTS.md                 # rules every agent session reads first (see below)
  docs/
    architecture.md         # this plan, kept current
    adr/                    # one file per architecture decision
    api/openapi.json        # generated from Zod schemas
  packages/
    shared/                 # pure TS, no DOM, no Node APIs
      src/dto/              # Zod schemas: RoomDTO, GameDTO, API requests/responses
      src/seed/             # SeedCode parse/format, Crockford base32
      src/geometry/         # constants (door size, grid), doorFrame(), wall math
      src/graph/            # shortestPath(), used by validator and debug view
    generator/              # server-only, deterministic, integer math
      src/prng/             # cyrb128 hashing, sfc32, sub-stream derivation
      src/difficulty/       # difficulty tables
      src/topology/         # depth layers, links, edge mix
      src/layout/           # room footprints, door placement
      src/furnish/          # prefab rules, placement, walkability
      src/identity/         # palettes, signatures, twins
      src/validate/         # independent validator + metrics
      src/index.ts          # generateLevel(seed): Level
      cli/                  # gen, validate, sweep, dump commands
    server/
      src/routes/           # Fastify routes (games, debug, health)
      src/services/         # GameService, LevelCache, Neighbourhood
      src/db/               # Drizzle schema, migrations, repositories
      src/config.ts
    client/
      src/app/              # React shell: menu, HUD, pause, result, i18n
      src/engine/           # framework-free game engine
        loop/  render/  portals/  rooms/  prefabs/
        player/  audio/  goal/  world/  net/  debug/
      src/main.tsx
  e2e/                      # Playwright tests
  docker/                   # Dockerfile, compose files
```

### AGENTS.md rules (summary)

1. Read `docs/architecture.md` and the task's section before writing code. If the task conflicts with this plan, stop and raise it in the pull request instead of improvising.
2. One task ID per branch and pull request (`feat/T2.3-validator`). The PR description lists the task's acceptance criteria as checkboxes with evidence (test names, screenshots, numbers).
3. TypeScript strict, no `any`, no non-null assertions without a comment. Public functions get TSDoc.
4. The generator must stay deterministic: no `Math.random`, no `Date`, no floating-point math, no iteration over unordered collections without sorting. A lint rule bans these imports inside `packages/generator`.
5. Any change that alters generator output for an existing seed must bump `GENERATOR_VERSION` and update the golden-seed hashes in the same PR.
6. Every bug fix starts with a failing test.
7. Never change a `shared` DTO without updating both client and server in the same PR.
8. Architecture changes get an ADR in `docs/adr/`.

### Definition of done (every task)

- Lint, type check and all tests pass in CI.
- Acceptance criteria demonstrated in the PR.
- New public modules have unit tests; coverage of `generator` and `shared` stays at or above 90 % of lines.
- No console errors or warnings in the client during the task's manual check.

## 7. Level data model, coordinates, seed format and DTO contracts

Each room lives in its own local coordinate system; there is no global floor plan. Rooms are joined only by door-to-door transforms, which is what makes non-Euclidean layouts free to build.

### 7.1 Units and room coordinates

- Metres, right-handed, +Y up (Three.js convention).
- The generator works in integer grid units of 0.25 m. Values are converted to metres only when DTOs are built.
- Room origin = centre of the floor. Interior footprint: x in \[−w/2, +w/2\], z in \[−d/2, +d/2\], ceiling at h = 2.8 m.
- Walls: N at z = −d/2, S at z = +d/2, W at x = −w/2, E at x = +w/2.
- Each room owns half of every wall: `WALL_HALF = 0.15 m` of wall and door jamb outside its footprint.

### 7.2 Door frame (the most important convention)

All doorways are 1.0 m wide and 2.1 m high. A door's local frame is computed only by `shared/geometry/doorFrame(room, door)`, so client and server can never disagree.

- Origin: bottom centre of the opening, on the **portal plane** = the footprint wall pushed outward by `WALL_HALF`.
- Local +Z points into the room (inward normal); +Y up; +X = Y × Z.
- Rotation about Y by wall: N = 0, S = π, E = −π/2, W = +π/2.
- `offset` = signed distance in metres from the wall centre to the door centre, along the door's local +X.
- Placement rules: door edge at least 0.5 m from a corner, at least 0.6 m between doors on one wall.

### 7.3 Portal transform

A link D (in room A) → E (in room B) maps any point or camera from A's coordinates into B's coordinates:

```latex
T_{D \to E} = M_E \, R_y(\pi) \, M_D^{-1}
```

Here M is a door's frame matrix in its room's coordinates and R\_y(π) is a half turn about Y. A point leaving A just outside D (local z = −ε) arrives in B just inside E (local z = +ε), moving in the same direction relative to the doors. The map is a proper rotation plus translation, never a mirror. It is implemented once in `client/engine/portals/portalMath.ts` with unit tests for all 16 wall combinations.

### 7.4 Seed code

Format: `<D><V>-<XXXX>-<XXXX>`, for example `M1-7K2Q-X9MP`.

- D = difficulty: E, M or H. V = generator major version, one digit. XXXX-XXXX = 40 random bits in Crockford base32.
- Parsing is case-insensitive and ignores spaces and dashes; O reads as 0, I and L read as 1.
- Random games: the server draws 40 bits from `crypto.randomBytes`.
- An unknown version digit is rejected with a clear message. Release 1.0 supports version 1 only.
- PRNG: `cyrb128(canonicalSeed + "|" + label)` seeds an `sfc32` generator. Every subsystem has its own label (`topology#<attempt>`, `room:<id>:layout`, `room:<id>:furnish`, `identity`). Changing furniture rules therefore never changes the topology of a seed.

### 7.5 Wire contracts (in `shared/src/dto`, as Zod schemas)

```ts
type Difficulty = 'easy' | 'medium' | 'hard';
type RoomType = 'living' | 'kitchen' | 'bedroom' | 'bathroom' | 'hallway' | 'study';
type Wall = 'N' | 'E' | 'S' | 'W';
type RoomId = string;  // 'r00'..'r23'
type DoorId = string;  // 'd0'..'d3'

interface DoorDTO {
  id: DoorId;
  wall: Wall;
  offset: number;                                  // metres, see 7.2
  link: { room: RoomId; door: DoorId } | null;     // null = sealed
}

interface FurnitureDTO {
  id: string;                     // unique within room, e.g. 'f07'
  prefab: PrefabId;               // see section 10
  x: number; z: number;           // metres, footprint centre of the item
  rot: 0 | 1 | 2 | 3;             // quarter turns about Y
  variant: number;                // shape variant inside the prefab
  colors: string[];               // hex colours, prefab-specific order
  signature?: true;               // the room's unique landmark
  params?: Record<string, number | string>; // e.g. painting pattern
}

interface LightDTO { kind: 'ceiling' | 'lamp'; x: number; y: number; z: number; color: string; intensity: number; }

interface RoomDTO {
  id: RoomId;
  type: RoomType;
  label: string;                  // i18n key, e.g. 'room.living'
  width: number; depth: number; height: number;
  floor: 'wood' | 'tile' | 'carpet';
  palette: { wall: string; floor: string; trim: string; ceiling: string };
  doors: DoorDTO[];
  furniture: FurnitureDTO[];
  lights: LightDTO[];
  goal?: { x: number; y: number; z: number };   // only in the goal room
}
```

`RoomDTO` intentionally omits depth, spine membership and twin links. Those appear only in the debug endpoint (section 16). Rooms are immutable for the life of a game, so the client caches them by ID forever.

## 8. Procedural topology generation

The generator builds a valid house by construction in a single pass, then the validator re-checks it. A failed check triggers a deterministic retry with the next attempt label (`topology#1`, `topology#2`, … up to 64). Given these rules, retries should be rare; the CI sweep tracks the retry rate.

### 8.1 The three construction invariants

Let d(r) be a room's assigned depth, with d(start) = 0 and d(goal) = L. The goal is the only room at depth L.

1. **No skipping ahead.** Every link u → v satisfies d(v) ≤ d(u) + 1. Links to lower or equal depth are always allowed.
2. **Progress.** Every room u with d(u) < L has at least one link to a room at depth d(u) + 1.
3. **Coverage.** Every room v with d(v) ≥ 1 receives at least one link from a room at depth d(v) − 1.

What follows, and what the validator re-proves on the actual graph:

- Invariant 1 makes every route from start to goal at least L doors long. The spine makes it exactly L.
- Invariant 2 means following forward doors from any room reaches the goal in L − d(u) steps. No dead end or trap region can exist.
- Invariant 3 means every room is reachable from the start, so no generated room is wasted.

### 8.2 Algorithm

1. **Parameters.** Decode the seed, load the difficulty table (8.3). Draw room count N and solution length L.
2. **Rooms and types.** Create N rooms. Every type appears at least once. The start room is a living room or hallway. Pick the twin rooms (decoys that copy another room's identity skeleton, see 10.5).
3. **Depths.** Spine rooms get depths 0…L. Decoys get depths 1…L−1, weighted toward the middle layers. Check layer capacity: the free door slots in layer k must cover every room in layer k + 1. If not, add a door to a layer-k room (up to the maximum) or move a decoy to another layer.
4. **Footprints and door slots.** Draw each room's size from its type's range (10.1). Draw its door count, then place doors on walls following the rules in 7.2. Start room gets at least 2 doors, hallways one extra, the goal room at least 1.
5. **Mandatory links.** In this order: spine links r(k) → r(k+1); coverage links (each decoy picks a parent with a free slot in the layer above, most free slots first, ties by room ID); progress links for any room still without a forward door. The arrival door in the target room is random, preferring doors not yet used as an arrival. This produces the "I came in from the other side" effect.
6. **Reciprocation.** For each existing link u.s → v.t whose arrival door v.t is still free, set v.t → u.s with the difficulty's reciprocal probability. Allowed only when it does not break invariant 1 (that is, d(u) ≤ d(v) + 1).
7. **Remaining slots.** Each free slot draws a link kind from the difficulty weights: back (lower depth), lateral (same depth, other room), self (another door of the same room), forward (depth + 1) or sealed. Sealing prefers doors that are already the arrival point of a non-reciprocated link, which creates true one-way passages.
8. **Validate and measure** (section 9). Metrics outside the difficulty's ranges count as a failed attempt.
9. **Lay out and furnish** each room with its own sub-seed (section 10).
10. **Shuffle room IDs** with a seeded permutation, so IDs reveal nothing about depth or the spine. Canonicalise (rooms and doors sorted by ID) and compute `levelHash` = SHA-256 of the canonical JSON.

### 8.3 Difficulty table (v1, tunable at Gate G2)

| Parameter | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Rooms (N) | 8–10 | 12–16 | 18–24 |
| Minimum solution length L (doors) | 4–5 | 6–7 | 8–10 |
| Doors per room | 2–3 | 2–4 | 3–4 |
| Reciprocal probability | 0.85 | 0.50 | 0.20 |
| Asymmetric link share (validated range) | at most 25 % | 30–60 % | at least 60 % |
| Self-links | 0 | 1–2 | 2–4 |
| Sealed (one-way) doors | 0–1 | 1–3 | 3–6 |
| Back links jumping 3+ layers | 0–1 | 2–3 | at least 4 |
| Twin rooms | 0 | 1–2 | 3–5 |
| Misleading doors in spine rooms (lead away from goal) | at least 1 | at least 3 | at least 6 |

The table lives in `generator/src/difficulty/table.ts` as data. Changing a value changes outputs, so it requires a generator version bump after release.

### 8.4 Performance budget

One attempt including furnishing: under 50 ms at p95 on the server. A full Hard generation including retries: under 200 ms at p95. The server caches generated levels in an in-memory LRU (100 levels) keyed by seed code.

## 9. Mathematical validation

No level reaches a player unless `validateLevel(level)` returns no errors. The validator takes only the finished `Level` object and never imports generator internals, so a generator bug cannot hide itself.

### 9.1 Graph model

The house is a directed multigraph G: vertices are rooms, edges are links (sealed doors add no edge). Because there are no items or keys, a player's state is just the current room. Picking up the goal ends the game. So "every reachable game state" in spec §9 means "every room reachable from the start".

- R = rooms reachable from the start (breadth-first search over links).
- C = rooms from which the goal is reachable (breadth-first search from the goal over reversed links).

Both searches are O(rooms + doors), well under 1 ms for 24 rooms.

### 9.2 Checks

| ID | Check | Spec |
| --- | --- | --- |
| V1 | The goal is in R (a finite route exists from the start). | §9.1 |
| V2 | R is a subset of C: every reachable room can still reach the goal. This rules out any trap region, including cycles with no exit. | §9.2, §9.4, §9.5 |
| V3 | Shortest start-to-goal distance is within the difficulty's L range. | §9.3, §10 |
| V4 | Every room is in R (no unreachable rooms). | quality |
| V5 | Structural integrity: link targets exist; at most one outgoing link per door; no door links to itself; door IDs unique per room; start ≠ goal. | §7 |
| V6 | Door placement: corner and spacing rules from 7.2; doors do not overlap. | §12 |
| V7 | Furniture: no forbidden overlaps; nothing inside a door clearance zone or the goal zone; inside the footprint. | §12 |
| V8 | Walkability: the spawn point, every door clearance zone and the goal zone are in one connected component of the room's free grid, after inflating obstacles by the player radius (0.3 m). | §12 |
| V9 | Difficulty metrics are inside the ranges of table 8.3. | §8 |
| V10 | Determinism (CI only): generating the same seed twice gives the same `levelHash`. | §5 |

Cycles are allowed and are not checked against: the guarantee is that an exit exists, not that the player takes it.

### 9.3 Failure handling

- Random game: if all 64 attempts fail, the server silently draws a new random seed. The event is logged at error level with the failed seed for later analysis.
- Typed seed: a well-formed seed always produces the same result. If it cannot produce a valid house, the API returns 422 with a clear message. For seeds the server ever issued, this cannot happen, because they were validated before use.

### 9.4 Solution path for the debug view

`shared/graph/shortestPath(graph, from, to)` returns a door-level path: a list of steps, each with the room, the exit door and the arrival door. Ties are broken by room ID, then door ID, so the displayed path is stable. The server computes the path from both the start and the player's current room.

### 9.5 Validator test suite

- Hand-built failing graphs, one per check: unreachable goal, a reachable sink cycle, a one-way door into a dead end, a too-short path, a self-referencing door, a blocked doorway.
- Property tests: 10 000 seeds per difficulty must validate, every run in CI. The sweep also reports retry rate (target below 2 %) and p95 generation time.

## 10. Room layout, procedural furnishing and room identity

The server decides what goes where; the client decides how it looks. Prefab metadata (footprint, anchor, clearance) lives in `shared/prefabs/catalog.ts` so the validator can check it. The low-poly geometry recipes live only in `client/engine/prefabs`.

### 10.1 Room types

| Type | Size w × d (m) | Floor | Required items | Optional items |
| --- | --- | --- | --- | --- |
| Living room | 6.0–8.0 × 6.0–9.0 | wood | sofa, coffee table, TV unit | armchair, bookshelf, floor lamp, side table, rug |
| Kitchen | 4.0–6.0 × 4.0–6.0 | tile | counter run with sink, stove, fridge | dining table + chairs, wall cabinets, bin |
| Bedroom | 4.0–6.0 × 4.5–6.0 | carpet | bed, wardrobe, nightstand | dresser, desk, mirror, rug |
| Bathroom | 3.0–4.0 × 3.0–4.0 | tile | bathtub or shower, toilet, washbasin | towel rack, laundry basket, mirror |
| Hallway | 2.0–2.5 × 5.0–9.0 | wood | runner rug, coat rack | shoe cabinet, console table, umbrella stand |
| Study | 3.5–5.0 × 3.5–5.0 | carpet | desk, office chair, bookshelf | filing cabinet, globe, reading chair |

Decoration for every type: paintings, wall clocks, plants, lamps, rugs. Sizes snap to 0.5 m.

### 10.2 Prefab metadata

Each prefab entry declares: ID, footprint in grid units per variant, anchor (`wall`, `corner`, `center`, `wallHung` or `floorFlat`), front clearance in grid units, and whether it blocks walking. Rugs (`floorFlat`) and wall-hung items (paintings, clocks, cabinets above 1.6 m) never block walking. About 35 prefabs ship in 1.0, each with 2–3 shape variants.

### 10.3 Placement algorithm (per room, own sub-seed)

1. Build a 0.25 m occupancy grid of the footprint.
2. Reserve zones: each door gets a clearance zone 1.4 m wide and 1.2 m deep; the start room gets a 1 m spawn zone facing a door; the goal room gets a 1.5 m goal zone near the centre.
3. Place required items, wall- and corner-anchored first, trying candidate positions in seeded random order. A position is accepted only if the footprint and its front clearance are free.
4. After each blocking item, flood-fill the inflated free grid. Reject the placement if any reserved zone becomes disconnected (check V8).
5. Place optional items by type probability, then decoration.
6. Add lights: one ceiling light, plus lamp prefabs that carry their own light.
7. If a required item cannot be placed in 200 tries, skip it and record the miss as a metric. CI asserts that at least 99.9 % of rooms get all required items.

Only quarter-turn rotations and grid positions are used, so all placement math stays integer and deterministic.

### 10.4 Identity: every room is recognisable

- **Palette.** Each room draws wall, floor, trim and ceiling colours from its type's palette list. Two rooms of the same type get different palettes unless one is a twin.
- **Signature landmark.** Every room gets exactly one signature item, unique in the house: a painting with a procedural pattern (stripes, circles, waves or grid) in a unique colour pair, a grandfather clock, a red armchair, an aquarium, a large plant, or a globe. Uniqueness is enforced across the house through the `identity` sub-stream.
- **Stable data.** All of this is in `RoomDTO`. Reaching a room by any route shows the same data, because there is only one copy of it.

### 10.5 Twin rooms (difficulty feature)

A twin copies another room's type, footprint, door positions, palette and non-signature furniture layout exactly. Only the signature landmark differs. This creates the intended "is this the same living room?" doubt while staying fair: an attentive player can always tell rooms apart by the landmark. Twins are chosen in step 2 of 8.2, before doors are placed, so the copied layout stays valid.

### 10.6 State persistence

Rooms are immutable in 1.0, so identity persistence is automatic: the client caches each `RoomDTO` and its built Three.js scene by room ID, and reuses that one scene for every portal that shows the room. For future modifiable objects, the client world store reserves `roomState: Map<RoomId, Map<ObjectId, ObjectState>>`, rendered on top of the immutable room and synchronised through the same transition event channel as moves.

## 11. Portal rendering and traversal

Every doorway with a link is a live window into its target room, rendered each frame from a virtual camera, so the player never sees a cut, fade or loading step. This is spec priority #1 and is built first (Phase 1) with hand-authored rooms.

### 11.1 Scene organisation

- Each room is its own `THREE.Scene` in its own coordinates: walls, floor, ceiling, furniture, lights, door frames, sealed door panels and one portal mesh per linked door.
- A room scene is built once from its `RoomDTO` and cached by room ID. The same scene is rendered as often as it appears (current room, behind several doors, through a self-link).
- Static geometry is merged per material, keeping each room at or below 60 draw calls.
- Every room scene has the same light layout: 1 hemisphere light plus exactly 4 point lights (unused ones at intensity 0). Three.js compiles shaders per light count, so a fixed count prevents shader recompiles when switching rooms. Call `renderer.compile()` for each room scene when it is loaded.

### 11.2 Render algorithm (per frame)

1. **Build the portal tree.** The root is the current room seen by the main camera over the full screen. For each linked door: skip it if the camera is behind the portal plane; skip it if its opening is outside the camera frustum; project its four corners to a screen rectangle and intersect with the parent's rectangle; skip if empty. Otherwise add a child node: target room, virtual camera = T(D→E) applied to the parent camera, clip plane = the target door's plane, level + 1.
2. **Limits.** Maximum depth 3 (Low quality: 2). Maximum 12 passes per frame, largest screen area first. Beyond the limits a portal shows a fallback: the target room rendered once without its own portals, which at that distance is a few dozen pixels.
3. **Oblique near plane.** Each virtual camera's projection matrix gets an oblique near plane equal to the target door plane (offset 1 mm into the target room). Nothing between the virtual camera and the doorway, such as the far side of the target room's wall, is ever drawn. Room meshes set `frustumCulled = false`, because Three.js culling assumes a standard projection.
4. **Render children first.** Passes run deepest first, each into a pooled render target with its own depth buffer. Levels 1, 2 and 3 use 100 %, 75 % and 50 % of the screen resolution.
5. **Portal shader.** A portal mesh samples its child's render target at screen position (`gl_FragCoord.xy / viewport`). All passes share the same camera projection except for the near plane, so the screen-space lookup lines up exactly at every level. Before each pass, the room's portal materials are pointed at that pass's child targets.
6. **Main pass.** The current room renders to the screen. HUD and menus are DOM on top.

### 11.3 Walking through a door

- **Portal mesh shape.** Each portal is a shallow box (1.0 × 2.1 × 0.25 m) behind the portal plane, faces drawn on both sides with the portal shader. When the camera's near plane cuts through the doorway, it still sees box faces showing the same image, so no gap or flash appears. The box is deeper than the near-plane footprint (near = 0.05 m, about 0.08 m half-diagonal at 75° field of view).
- **Crossing test.** After each movement step, for every linked door of the current room, express the old and new eye positions in door coordinates. If z went from ≥ 0 to < 0 while |x| ≤ 0.5 m and 0 ≤ y ≤ 2.1 m, the player crossed.
- **Teleport.** Apply T(D→E) to the player's position, yaw and velocity; set the current room to the target; queue a transition event for the server (15.4); continue the same frame. Movement per simulation step (5 cm at 3 m/s, 60 Hz) is far below the door depth, so a crossing cannot be skipped.
- **Sealed doors** have no portal mesh. They show a closed door panel and their collider blocks the opening.

### 11.4 Expected effect of asymmetric doors

While the player walks forward through door D into room B, the view ahead (B) stays continuous. The view behind switches from room A to wherever B's arrival door E leads. The player notices this only on turning around, which is the effect spec §2 and §3 ask for. The 0.3 m wall thickness keeps the side view mostly blocked by door jambs while the player straddles a doorway.

### 11.5 Quality and robustness

- Device pixel ratio capped at 1.5. Antialiasing on the main pass; 4× MSAA on WebGL2 render targets.
- Automatic quality: if the average frame time stays above 20 ms for 2 seconds, step down (MSAA off, then depth 2, then render-target scale 75 % at level 1). Step back up after 10 seconds below 12 ms.
- WebGL context loss shows a short message and rebuilds all GPU resources on restore. Room data is not lost.
- A dev-only `?portalDebug=1` flag tints each recursion level and shows pass counts, to make portal bugs visible in screenshots.

## 12. Player controller and collision

Movement is a simple 2D circle on a flat floor, simulated at a fixed 60 Hz, which keeps door crossing exact and the controls predictable.

### 12.1 Input

- Pointer Lock starts on the first click on the canvas. Use `unadjustedMovement` where the browser supports it.
- Keys are read by physical position (`event.code`: `KeyW`, `KeyA`, `KeyS`, `KeyD`), so Hungarian QWERTZ and other layouts work unchanged.
- Mouse look: yaw unlimited, pitch clamped to ±85°. Default sensitivity 0.0022 rad per pixel.
- When Pointer Lock is lost (Esc, tab switch), movement stops and a "click to continue" overlay appears. The timer keeps running (assumption A6).
- Debug view toggle: the key under Esc (`event.code = Backquote`, the 0 key on Hungarian layouts) and F9 as an alternative. Neither is used by normal controls.

### 12.2 Movement

- Fixed-step simulation at 60 Hz with an accumulator; rendering interpolates between steps.
- Direction follows the camera's horizontal heading. Diagonals are normalised.
- Walking speed 3.0 m/s, acceleration 20 m/s², stops within about 0.15 s after keys are released. No running, jumping or crouching.
- Eye height 1.65 m. Optional head bob of 1 cm amplitude, synchronised with footsteps, on by default and switchable in settings.

### 12.3 Collision

- The player is a circle with radius 0.3 m.
- Colliders per room: wall segments with gaps at doors, door jamb segments, blocking furniture as axis-aligned rectangles, and sealed door panels.
- Resolution: move, push out of overlapping colliders, slide along walls; at most 4 iterations per step.
- Inside a doorway the jambs keep the circle's centre within 0.2 m of the door's centre line. Its front half may reach up to 0.3 m into the target room before the teleport. That area is always free, because the target door's clearance zone (1.4 × 1.2 m) contains no furniture. Target-room colliders therefore never need to be tested before the crossing.

### 12.4 Spawn and settings

- The player spawns in the start room's spawn zone, facing the nearest door.
- Settings (saved in `localStorage`): mouse sensitivity, invert Y, field of view 60–90° (default 75°), head bob, master, music and effects volume, graphics quality (Auto, High, Low).

## 13. Goal object: the Megajánlott jegy

The goal is impossible to miss: the moment the goal room is in view (directly or through a doorway), a glowing, floating, turning diploma is the brightest object on screen.

- **Model.** A procedural low-poly rolled diploma: a cylinder scroll with a red ribbon and a gold wax seal, about 0.45 m long. Built in `client/engine/goal`.
- **Placement.** Centre of the goal room's reserved 1.5 m goal zone, 1.2 m above the floor (position from `RoomDTO.goal`).
- **Motion.** Vertical bob of ±0.08 m with a 3 s period; rotation about Y at 0.6 rad/s plus a slight 10° tilt. Motion is computed from game time, so it looks identical through every portal in the same frame.
- **Glow.** Emissive warm-gold material; an additive halo sprite (camera-facing, 1.4 m); a warm point light (one of the room's 4 fixed light slots); a slow sparkle of 20 particles. No post-processing bloom, because bloom does not combine cleanly with portal render targets.
- **Pickup.** Walking within 0.9 m (horizontal distance) of the diploma collects it. No key press needed (assumption A7).
- **Pickup sequence.** Input freezes; the diploma flies to the camera over 0.6 s and flashes; the completion sound plays; the client calls the complete endpoint; the result screen opens when the server confirms (or after 3 s with a "saving…" state that retries in the background).

## 14. Audio system

All sound is synthesised in the browser with the Web Audio API: no audio files, no licensing, under 15 kB of code. Each sound sits behind a small interface (`FootstepVoice`, `MusicBed`, `GoalVoice`, `Stinger`), so recorded CC0 samples can replace any of them later without touching game code.

### 14.1 Graph and lifecycle

- One `AudioContext`, created and resumed on the player's "Start" click (browsers block audio before a user gesture).
- Buses: music and effects, each with a gain from settings, into a master gain and a soft compressor.
- A shared reverb (convolver with a generated 1.8 s impulse) on a send bus gives the house a slightly hollow, uncanny space.

### 14.2 Footsteps

- One step per 1.3 m travelled (about 2.3 steps per second at walking speed). The first step fires after 0.15 m, so short taps make a sound. No new steps when speed falls below 0.3 m/s, so steps stop with the player.
- Each step is a short filtered noise burst plus a low thump, shaped per floor type: wood (hollow, mid band), tile (bright, sharp), carpet (soft, muffled, quieter).
- Every step randomises pitch (±6 %), level (±2 dB) and filter (±10 %), and alternates a slight left/right pan, so steps never sound like one repeated sample.

### 14.3 Ambient music bed

A generative drone: two slowly detuned low oscillators, quiet filtered room-tone noise, and a sparse chime from a whole-tone scale every 6–14 seconds through the reverb. It plays about 24 dB below full scale and never masks footsteps or the goal hum.

### 14.4 Goal hum (spatial)

- Two soft sine tones with slow tremolo, through an HRTF panner.
- If the goal is in the current room, the source sits at the diploma.
- If the goal room is visible through doors, the source is placed where the diploma appears through the nearest portal: the renderer's portal tree already holds the chain of transforms, and the hum uses its inverse. Each door in the chain lowers the level by 6 dB. The player can literally follow the sound through a doorway.

### 14.5 Completion sound

A bright, bell-like rising arpeggio (FM synthesis, about 2.5 s) on the effects bus. The music ducks by 12 dB while it plays. It is clearly different from every other sound in the game.

## 15. Backend: API, sessions, preloading, timing and persistence

The backend is the single source of truth for levels, game progress and results; the client only ever receives rooms it is about to need, and the server checks every door it walks through.

### 15.1 REST API (`/api/v1`, JSON)

| Method and path | Request | Response | Notes |
| --- | --- | --- | --- |
| `POST /games` | `{mode:'random', difficulty}` or `{mode:'seed', seed}` | 201 `{gameId, seed, difficulty, generatorVersion, startRoom, spawn:{x,z,yaw}, rooms: RoomDTO[]}` | Generates (or loads from cache) and validates. Returns start neighbourhood. 400 bad seed format, 422 unsupported version or invalid seed. |
| `POST /games/:id/start` | `{}` | `{startedAt}` | Called when the player first gains control. Idempotent. |
| `POST /games/:id/transitions` | `{seq, from, door, clientElapsedMs}` | `{seq, current, rooms: RoomDTO[]}` | Validates the move, returns only rooms not yet sent. Idempotent per `seq`. 409 on mismatch. |
| `POST /games/:id/complete` | `{lastSeq, clientElapsedMs, debugUsed}` | `{result:{seed, difficulty, completionMs, timeSource, completedAt}}` | Accepted only if the current room is the goal room. Idempotent. |
| `GET /games/:id/rooms?ids=` | room IDs | `RoomDTO[]` | Safety-net fetch; only rooms within the prefetch radius of rooms the game has visited. |
| `GET /games/:id/debug` | none | full graph, start, goal, depths, path from start and from current room | Admin view (section 16). Enabled by `DEBUG_VIEW_ENABLED`. |
| `GET /health` | none | `{status, db, version}` | For the platform's health check. |

Requests and responses are Zod schemas in `shared`; Fastify validates both. `docs/api/openapi.json` is generated from them in CI.

### 15.2 Game lifecycle

`created` → `started` → `completed`, or `expired` when a started game stays incomplete for 24 hours (hourly job). A game ID is a random UUID and acts as the only credential for its endpoints.

### 15.3 Preloading: neighbourhood streaming (spec §17)

- The renderer looks at most 3 doors deep. The server therefore keeps the client supplied with every room within **4 outgoing door hops** of the current room (`PREFETCH_RADIUS = 4`).
- `POST /games` returns all rooms within 4 hops of the start. Each transition response adds any rooms within 4 hops of the new room that were not sent before (the server tracks sent room IDs per game).
- The extra hop is the latency budget: the player must cross at least one whole room before a newly needed room can come into view, which takes at least about a second. Normal network delay therefore never shows up on screen.
- Safety net: after each transition the client checks that every room within 3 hops is cached and fetches any gap with `GET /rooms`. If a target room is still missing when its door comes into view (abnormal case), the doorway shows a dark interior and the client keeps retrying.
- Each new room is built into a Three.js scene and shader-compiled on arrival, spread over idle frames, so first sight of a room never causes a hitch.

### 15.4 Transition validation

- The client sends one event per door crossing, in order, through a background queue with retries. Rendering never waits for the server.
- The server accepts an event if the game is started, `seq` equals last seq + 1, `from` equals the current room, and the door exists with a link. It then moves the current room to the link's target and stores the event.
- A repeated `seq` returns the stored response. Any other mismatch returns 409, and the game is flagged `integrity = 'desync'` (a bug signal). The game continues and its result is stored with the flag.
- Before `complete`, the client flushes its queue.

### 15.5 Timing (spec §19)

- The timer starts when the player first gains control in the start room: the client records `performance.now()` and calls `/start`; the server records `started_at`.
- On completion: server elapsed = receive time − `started_at`. The official time is the client's elapsed time if it is 0–5 s less than the server's (normal network delay). Otherwise the server time is used and `timeSource = 'server'`.
- Times are stored as integer milliseconds and shown as mm:ss.cc.

### 15.6 Persistence (PostgreSQL)

| Table | Key columns | Purpose |
| --- | --- | --- |
| `games` | `id` uuid PK, `seed_code`, `difficulty`, `generator_version`, `level_hash`, `status`, `current_room`, `last_seq`, `sent_rooms` text\[\], `debug_used`, `integrity`, `created_at`, `started_at`, `completed_at` | Game sessions. Survives server restarts. |
| `results` | `id` uuid PK, `game_id` FK unique, `seed_code`, `difficulty`, `generator_version`, `completion_ms`, `time_source`, `transitions`, `debug_used`, `integrity`, `completed_at` | Permanent anonymous results. Indexes on `seed_code` and (`difficulty`, `completion_ms`) for later leaderboards. |
| `game_transitions` | (`game_id`, `seq`) PK, `from_room`, `door`, `to_room`, `client_elapsed_ms`, `server_at` | Move log for verification and bug reproduction. Deleted 30 days after the game ends. |

No personal data is stored: no IP addresses, no user agents in the database. Levels are not stored. They are regenerated from the seed code, and the stored `level_hash` is compared on regeneration to catch generator drift.

### 15.7 Limits and configuration

- Rate limits per IP: 20 game creations per minute, 20 transitions per second per game. Request body limit 16 kB.
- Security headers via `@fastify/helmet`; same origin, so CORS is off.
- Environment variables: `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `DEBUG_VIEW_ENABLED` (default true), `PREFETCH_RADIUS` (default 4), `LEVEL_CACHE_SIZE` (default 100).

## 16. Admin / debug view

The debug view is a 2D overlay of the house's graph, with the guaranteed solution path drawn in a distinct colour. It opens and closes with the Backquote key (or F9) and is hidden in normal play.

### 16.1 Behaviour

- Opening it releases Pointer Lock and fetches `GET /games/:id/debug` (cached; refetched after each transition to update the path from the current room). The game keeps running behind a 30 % dimmed backdrop; the timer does not pause.
- Opening it sets `debugUsed = true` for the game (assumption A8).
- Closing it returns to the game; one click re-locks the pointer.

### 16.2 Content

- **Layout.** Layered left to right by depth (start at the left, goal at the right). Rooms within a layer sorted by ID. The layout is computed in the client (`engine/debug/layout.ts`); no extra library.
- **Rooms.** Box with localised type name and ID ("Konyha · r07"), and a small door list. Colours: start green, goal gold, current room thick blue outline, twin rooms marked with a twin icon and a link to the room they copy.
- **Links.** Arrows from door to door. Reciprocal pairs are drawn as one line with two heads. Self-links are loops. Sealed doors are a small crossed square. One-way passages are dashed.
- **Solution path.** The shortest path from the current room is drawn thick in orange; a toggle switches to the path from the start. Below the graph the path is written as text, for example `START (Nappali r03) → Konyha r07 [d1→d2] → Nappali r03 [d2→d0] → Folyosó r11 → Hálószoba r05 → CÉL (Fürdőszoba r09)`.
- **Header.** Seed code, difficulty, generator version, `level_hash` (short), room and door counts, the difficulty metrics from 8.3, elapsed time.
- **In-world labels (optional toggle).** Door IDs and target rooms floating above each door frame in 3D.

### 16.3 Implementation

An SVG overlay rendered by React from the debug DTO. It reuses `shared/graph/shortestPath` for the text path, so the client display and the server's guarantee use identical code. The overlay is code-split and loaded only on first use.

## 17. UI flows and screens

The UI is deliberately thin: seven screens, all React overlays on top of the canvas, following the 18-step flow of spec §21.

### 17.1 Main flow

1. **Title screen.** Game name, "Új játék" (new game), settings, a short controls hint. A WebGL2 check runs here; failure shows the unsupported-browser screen.
2. **New game.** Two tabs: "Véletlen pálya" (difficulty: Könnyű / Közepes / Nehéz, with one-line descriptions) and "Seed megadása" (seed input with live format validation from `shared/seed`; difficulty is shown as decoded from the seed).
3. **Loading.** Calls `POST /games`, builds and compiles the start neighbourhood. Shows the seed. Typical duration under 1.5 s.
4. **Ready.** "Kattints a kezdéshez" (click to start). The click locks the pointer, resumes audio, calls `/start` and starts the timer.
5. **In game.** HUD: timer at the top centre (mm:ss), seed code in a small bottom-left label. Nothing else on screen.
6. **Pause overlay** (pointer lock lost). Resume, settings, seed with copy button, quit to title. Text notes that the timer keeps running.
7. **Result screen** after pickup: "Megszerezted a Megajánlott jegyet!", completion time (large), difficulty, seed with a copy button, "Újrajátszás ugyanezzel a seeddel" (replay this seed) and "Új játék" buttons. Shows a small marker if the debug view was used.

### 17.2 Other screens and states

- **Unsupported browser:** explains that a desktop browser with WebGL2 is needed.
- **Error:** network or server failure during creation, with retry. During play, network trouble shows only a small non-blocking "reconnecting" badge; play continues from cached rooms.
- **Settings:** the options listed in 12.4.

### 17.3 Seed sharing

The copy button writes the canonical seed code to the clipboard. The URL `/?seed=M1-7K2Q-X9MP` opens the new-game screen with the seed prefilled, so a seed can be shared as a link.

## 18. Non-functional requirements

Each target below is measurable and is checked at Gate G4 before release.

| Area | Target | How it is measured |
| --- | --- | --- |
| Frame rate | 60 fps at 1080p on a reference laptop with integrated graphics (Intel Iris Xe class); never below 30 fps on Low | Built-in frame-time overlay (`?perf=1`), 3-minute scripted walk on a Hard seed |
| Portal passes | At most 12 render passes per frame | Pass counter in the perf overlay |
| Door crossing | No visible gap, flash or hitch at any crossing | Gate G1 playtest; Playwright frame-sequence screenshots at a crossing |
| Preloading | 0 empty doorways in 100 scripted runs with 300 ms added network latency | E2E test with Playwright network throttling |
| Initial load | JavaScript under 600 kB gzipped; title screen interactive in under 3 s on a typical connection | Bundle analyser in CI; Lighthouse |
| Game creation | `POST /games` under 300 ms at p95 for Hard | Server timing logs |
| Generation | 10 000 seeds per difficulty validate; retry rate under 2 % | CI sweep |
| Determinism | Golden seeds produce identical `level_hash` on every CI run and on Linux, macOS and Windows | Golden-seed test |
| Availability | Single instance with health check and automatic restart; target 99 % monthly | Platform uptime metrics |
| Data durability | Managed PostgreSQL with daily backups, 7-day retention | Provider settings |
| Privacy | No personal data stored, no tracking cookies, no consent banner needed | Code review checklist |
| Accessibility | Adjustable sensitivity, field of view, head bob off, invert Y; readable UI contrast; all menus keyboard-operable | Gate G4 checklist |
| Browsers | Chrome, Edge, Firefox, Safari 17+ (desktop) | Manual pass at G4; Playwright on Chromium and Firefox in CI |

## 19. Testing and QA strategy

AI agents can verify almost everything with automated tests; humans verify only feel. The test pyramid below is built alongside the code, never after it.

| Layer | Tool | What it covers | When it runs |
| --- | --- | --- | --- |
| Unit | Vitest | Seed codec, PRNG, door frames, portal transforms (all 16 wall pairs, round trips), crossing test, collision, footstep cadence, timer maths | Every commit |
| Property | Vitest + fast-check | Generator invariants and validator on random seeds; transform inverse properties | Every commit (1 000 seeds), nightly (10 000 per difficulty) |
| Negative validator | Vitest | One hand-built broken level per check V1–V9 must be rejected | Every commit |
| Golden seeds | Vitest | 30 fixed seeds (10 per difficulty) must produce stored `level_hash` values | Every commit; a change requires a version bump |
| API integration | Vitest + Fastify `inject` + PostgreSQL in Docker | Every endpoint: happy path, invalid input, idempotency, 409 desync, completion rules, timing rules | Every commit |
| End-to-end | Playwright | Full playthroughs with the autopilot (below) on Easy, Medium and Hard fixed seeds; result stored; replay by seed gives the same house | Every pull request |
| Visual regression | Playwright screenshots | Fixed seed and camera poses: looking through a door, through a self-link, at a sealed door, mid-crossing frame sequence | Every pull request; diffs reviewed by a human |
| Performance | Perf overlay + scripted walk | Frame time and pass count on a Hard seed | Weekly and at G4 |
| Human playtest | Product owner | Feel of portals, confusion level per difficulty, audio mix | Gates G1–G4 |

### Test autopilot

A dev and test build exposes `window.__mj` (stripped from production). It reports state (current room, position, timer) and provides `autopilot.followPath()`. The autopilot reads the debug path, plans a walk inside each room with A\* over the free grid, and drives the normal input system (simulated key presses and mouse turns). This tests the real controller, collision, crossings and streaming end to end. The same autopilot makes a convincing live demo of solvability.

### Bug reproduction

Every bug report includes the seed code. The `generator` CLI can dump any seed as JSON and as a debug graph SVG (`pnpm gen dump M1-7K2Q-X9MP`). The stored transition log replays a player's route.

## 20. Deployment and operations

One Docker image plus one managed database is the whole production system; there is nothing else to operate.

- **Image.** Multi-stage build: install, build `shared`, `generator`, `client` and `server`, then copy the server bundle and the client's static files into a slim Node 22 image. Fastify serves the static client with long cache headers on hashed assets and `no-cache` on `index.html`.
- **Environments.** `local` (docker-compose: app + PostgreSQL), `staging` (deployed automatically from `main`), `production` (deployed from a version tag after Gate G4). Same image in staging and production.
- **Migrations.** Drizzle migrations run at container start, before the server listens. Migrations are additive only in 1.0.
- **CI/CD (GitHub Actions).** On each pull request: lint, type check, unit, property (1 000 seeds), golden, integration, e2e and visual tests. Nightly: 10 000-seed sweep per difficulty. On `main`: build and push the image, deploy staging, smoke test. On tag `v1.0.0`: deploy production.
- **Hosting.** Any container platform with health checks and managed PostgreSQL in an EU region (for example Fly.io, Render, Azure Container Apps or Google Cloud Run with Cloud SQL). One small instance (1 vCPU, 512 MB to 1 GB RAM) is enough for release 1.0.
- **Observability.** Structured pino logs with request IDs; logged events include game created (seed, difficulty, generation ms, attempts), validation failure, transition desync and completion. A `/health` endpoint checks the database. Client errors are posted to `POST /api/v1/client-errors` (rate-limited) and logged.
- **Backups.** Provider daily backups, 7-day retention. Results are the only data that matter long term.

## 21. Implementation order and timeline

Release 1.0 takes 6 weeks, from Monday 12 October to Friday 20 November 2026, in 9 phases on two parallel agent tracks, with 4 human gates. Track A (engine) builds everything the player sees and hears. Track B (platform) builds generation, validation, the API and the tooling. With a single track the same order applies and release moves to about 4 December 2026.

The order follows risk: portals first (priority #1, hardest), generator correctness second (priorities #2–#4), then integration, then polish. If Gate G1 fails, Phase 1 gets up to one more week and every later date moves by the same amount; nothing else in the plan changes.

&#91;embedded content: release 1.0 timeline · 9 phases, 2 tracks, 4 gates\]

The portal engine (Track A) and the generator (Track B) run side by side for the first two weeks and meet in the playable slice at G2; the last week is reserved for hardening only.

### Gates

| Gate | Date | Passed when |
| --- | --- | --- |
| G1 Portal feel | Fri 23 Oct | Product owner walks the fixture house for 10 minutes: no visible seam, flash or stutter at any door; asymmetric, self-link and sealed doors behave as in spec §2; 60 fps on the reference laptop. |
| G2 Playable slice | Fri 6 Nov | Generated, furnished houses served by the backend on all three difficulties; streaming without empty doorways; result stored. Product owner plays 2 seeds per difficulty and approves or adjusts the difficulty table. |
| G3 Content complete | Fri 13 Nov | Goal object, all audio, debug view and all screens done; product owner approves audio mix and the debug view. |
| G4 Release candidate | Thu 19 Nov | Every target in section 18 met; all 28 criteria of section 22 demonstrated; browser pass done. |

### Phase 0 — Foundations (both tracks, 12–13 Oct)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T0.1 | Monorepo scaffold: pnpm, Turborepo, strict TS, ESLint, Prettier, Vitest; `AGENTS.md`; ADR template and ADR-0001 (stack) | — | `pnpm build`, `lint`, `test` pass on empty packages |
| T0.2 | CI pipeline and docker-compose with PostgreSQL | T0.1 | CI green on a pull request; `docker compose up` starts the database |
| T0.3 | `shared/seed`: seed code parse and format | T0.1 | 10 000 random round trips; malformed input rejected; O, I, L normalised |
| T0.4 | `shared/geometry` (constants, `doorFrame`) and `shared/dto` Zod schemas from 7.5 | T0.1 | `doorFrame` tests for all 4 walls; schemas exported with types |
| T0.5 | `generator/prng`: cyrb128, sfc32, labelled sub-streams; lint rule banning non-deterministic APIs in `generator` | T0.1 | Known-answer vectors pass; lint fails on `Math.random` in `generator` |

### Phase 1 — Portal engine (Track A, 14–23 Oct)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T1.1 | Engine skeleton: Vite app, WebGL2 renderer, fixed-step loop, perf overlay | T0.1 | Empty scene at 60 fps; overlay shows frame time and pass count |
| T1.2 | Room builder from `RoomDTO` (walls with door gaps, jambs, floor, ceiling, fixed light rig, placeholder furniture boxes); 6 hand-authored fixture rooms | T0.4 | Fixtures pass Zod validation and render; ≤ 60 draw calls per room |
| T1.3 | Player controller: Pointer Lock, WASD, mouse look, circle collision | T1.2 | Collision unit tests; cannot pass walls or furniture; slides along walls |
| T1.4 | Portal maths: T(D→E), oblique projection | T0.4 | Tests for all 16 wall pairs; T followed by its reverse link's T returns the identity for reciprocal pairs |
| T1.5 | Portal renderer: tree, culling, render-target pool, screen-space shader, depth 3, 12-pass budget, fallback | T1.2, T1.4 | Through-door view matches a direct render of the target room from the transformed camera within 1 % pixel difference |
| T1.6 | Door crossing: shallow portal box, crossing test, teleport of position, yaw and velocity | T1.3, T1.5 | Frame-sequence test across a crossing shows no outlier frame; position and heading continuous |
| T1.7 | Fixture house reproducing the spec §2 scenario (asymmetric, return to the same living room by another door, self-link, sealed door, cycle) | T1.6 | Each step of spec §2 reproducible by hand; visual regression baselines recorded |
| T1.8 | Automatic quality steps and WebGL context-loss recovery | T1.5 | Forced slow frames step quality down; simulated context loss recovers |

### Phase 2 — Topology generator and validator (Track B, 14–21 Oct)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T2.1 | Difficulty table; rooms, types, depths, footprints, door slots (8.2 steps 1–4) | T0.5 | Layer capacity holds for 10 000 seeds |
| T2.2 | Links: mandatory, reciprocation, remaining slots (8.2 steps 5–7) | T2.1 | Invariants 1–3 hold for 10 000 seeds (property tests) |
| T2.3 | `shared/graph/shortestPath` with door-level steps and stable tie-breaking | T0.4 | Unit tests incl. self-links and multi-edges |
| T2.4 | Validator V1–V6, V9 and metrics, independent of the builder | T2.3 | One hand-built failing level per check is rejected; generated levels pass |
| T2.5 | Retry loop, ID shuffle, canonical JSON, `level_hash`, 30 golden seeds | T2.2, T2.4 | Golden test green; retry rate under 2 % |
| T2.6 | CLI: `gen`, `validate`, `sweep`, `dump` (JSON and SVG graph) | T2.5 | Sweep of 10 000 seeds per difficulty prints metrics and timing |

### Phase 3 — Layout, furnishing and identity (Track B 22–28 Oct, Track A 26–30 Oct)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T3.1 | Prefab catalogue metadata in `shared` (about 35 prefabs, variants, anchors, clearances) | T0.4 | Catalogue typed and documented; used by T3.2 and T3.4 |
| T3.2 | Placement algorithm and walkability; validator checks V7, V8 | T3.1, T2.5 | V7 and V8 pass for 10 000 seeds; at least 99.9 % of rooms get all required items |
| T3.3 | Identity: palettes, unique signatures, twin rooms | T3.2 | No two rooms share a signature; twins differ only in signature (tests) |
| T3.4 | Client prefab geometry recipes, merged per material | T3.1, T1.2 | Dev gallery page shows every prefab and variant; rooms stay at or below 60 draw calls |
| T3.5 | Procedural painting textures and signature visuals | T3.4 | Every signature visually distinct in a gallery screenshot |

### Phase 4 — Backend API and persistence (Track B, 29 Oct–4 Nov)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T4.1 | Fastify skeleton: config, health, static serving, error format, rate limits, helmet | T0.2 | `/health` reports database status |
| T4.2 | Drizzle schema, migrations, repositories (15.6) | T4.1 | Migrations run at start-up; repository tests pass |
| T4.3 | `POST /games`: level cache, validation, neighbourhood of radius 4 | T4.2, T3.3 | Integration tests for random and typed seeds, bad seed (400) and unsupported version (422) |
| T4.4 | `/start`, `/transitions`, `/rooms` with idempotency, 409 desync and sent-room tracking | T4.3 | Integration tests for every rule in 15.4 |
| T4.5 | `/complete`, timing rules, results | T4.4 | Tests for goal-room check, time-source rule, idempotency |
| T4.6 | `/debug` endpoint | T4.4 | Returns graph, depths, both paths; disabled by config flag |
| T4.7 | Expiry job, OpenAPI generation, Dockerfile, staging deployment | T4.5 | Staging reachable; smoke test passes in CI |

### Phase 5 — Client integration (Track A, 2–6 Nov)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T5.1 | Network client, ordered transition queue with retries; mock API from shared schemas for offline development | T0.4 | Queue survives a simulated 10 s outage without losing events |
| T5.2 | World store: room cache, streaming, background scene build and shader compile, safety-net fetch | T5.1, T4.4 | No empty doorway with 300 ms added latency over 20 scripted runs |
| T5.3 | UI shell: title, new game, loading, ready, HUD, pause, result screen; Hungarian and English strings | T5.1 | Full spec §21 flow works against staging |
| T5.4 | Timer and completion flow with a placeholder goal | T5.3, T4.5 | Result stored and shown; time matches server within the 15.5 rule |
| T5.5 | Seed copy button and `?seed=` share links | T5.3 | Replaying a copied seed gives the same `level_hash` |

### Phase 6 — Goal object and audio (Track A, 9–12 Nov)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T6.1 | Goal model, motion, glow, pickup sequence | T5.4 | Matches section 13; visible through portals |
| T6.2 | Audio engine: context lifecycle, buses, reverb, volume settings | T5.3 | Audio starts on the start click in all 4 browsers |
| T6.3 | Footsteps per floor type | T6.2 | Cadence tests; steps stop within one step of stopping |
| T6.4 | Ambient music bed | T6.2 | Plays at the specified level for 30 minutes without clicks or drift |
| T6.5 | Spatial goal hum through the portal tree | T6.2, T6.1 | Hum direction points at the doorway that shows the goal |
| T6.6 | Completion sound and music ducking | T6.2 | Plays once on pickup |

### Phase 7 — Debug view, settings and autopilot (Track B, 5–12 Nov)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T7.1 | Debug overlay: layered layout, link styles, solution path, header, path text | T4.6 | Shows the example path format from 16.2; updates after each transition |
| T7.2 | In-world door labels toggle | T7.1 | Labels match the overlay's door IDs |
| T7.3 | Settings screen (12.4) with persistence | T5.3 | All settings apply live and survive reload |
| T7.4 | `window.__mj` test API and autopilot; e2e playthroughs on fixed seeds | T7.1, T5.4 | Autopilot completes Easy, Medium and Hard seeds in CI |

### Phase 8 — Hardening and release (both tracks, 16–20 Nov)

| ID | Task | Depends on | Done when |
| --- | --- | --- | --- |
| T8.1 | Performance pass on the reference laptop; tune quality steps | all | Section 18 frame-rate targets met |
| T8.2 | Visual regression suite and 100-run latency test | T7.4 | Both green in CI |
| T8.3 | Cross-browser pass, including Safari Pointer Lock quirks | all | Checklist signed off in all 4 browsers |
| T8.4 | Security and privacy review; rate-limit tests | T4.7 | Checklist complete; no personal data stored |
| T8.5 | Production deployment, backups, smoke test, tag `v1.0.0` | G4 | Production live on Fri 20 Nov |

## 22. Requirement traceability

Every success criterion of spec §23 maps to a design section, the tasks that build it and the test that proves it; Gate G4 walks this table row by row.

| # | Spec §23 criterion | Design | Tasks | Proven by |
| --- | --- | --- | --- | --- |
| 1 | 3D game in the browser | 5, 11 | T1.1 | E2E smoke |
| 2 | Separate frontend and backend | 4, 6, 15 | T0.1, T4.1 | Architecture review |
| 3 | First-person navigation | 12 | T1.3 | E2E autopilot |
| 4 | WASD + mouse | 12.1 | T1.3 | Unit + G1 playtest |
| 5 | Target room visible through doors in real time | 11.2 | T1.5 | Visual regression |
| 6 | Visually continuous door crossing | 11.3 | T1.6 | Frame-sequence test + G1 |
| 7 | Asymmetric links | 8.2, 11.4 | T1.7, T2.2 | Fixture + metrics |
| 8 | Same room reachable through several doors | 8.2 step 5 | T2.2 | Property test |
| 9 | Same door need not lead back | 7, 8.2 step 6 | T2.2 | Property test |
| 10 | Persistent room identity | 10.4, 10.6 | T3.3, T5.2 | Unit + visual test |
| 11 | Procedural house topology | 8 | T2.1–T2.5 | Sweep |
| 12 | Procedural furnishing | 10.3 | T3.2, T3.4 | Sweep + gallery |
| 13 | Several difficulty levels | 8.3 | T2.1 | Metric ranges + G2 |
| 14 | Seed reproduces the level | 7.4, 8.2 step 10 | T2.5 | Golden seeds |
| 15 | User can enter a seed | 17.1 | T5.3 | E2E |
| 16 | Every level validated automatically | 9 | T2.4, T4.3 | Negative tests |
| 17 | Every accepted level solvable | 8.1, 9.2 | T2.2, T2.4 | Property test + autopilot |
| 18 | Goal at sufficient depth | 8.3, V3 | T2.4 | Property test |
| 19 | Floating, moving, turning, glowing goal | 13 | T6.1 | Visual review G3 |
| 20 | Footstep sounds | 14.2 | T6.3 | Unit + G3 |
| 21 | Background music or ambience | 14.3 | T6.4 | G3 |
| 22 | Separate completion sound | 14.5 | T6.6 | G3 |
| 23 | Toggleable admin/debug view | 16 | T7.1 | E2E |
| 24 | Debug view shows a guaranteed solution path | 16.2 | T7.1, T2.3 | E2E (autopilot follows it) |
| 25 | Completion time measured | 15.5 | T5.4, T4.5 | Integration |
| 26 | Seed and time stored persistently | 15.6 | T4.5 | Integration |
| 27 | Result screen shows result and seed | 17.1 | T5.3 | E2E |
| 28 | Main challenge is navigating impossible space | 8, 10.5, 11 | all | G2 playtest |

## 23. Risks and mitigations

The two risks most likely to move the release date are portal feel and difficulty tuning; both get an early human gate for that reason.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Portal seam, flash or one-frame lag at a crossing | Medium | High | Shallow portal box, crossing test in the same simulation step, frame-sequence test, Gate G1 in week 2 with one week of contingency. |
| Frame rate drops with recursive portals on integrated graphics | Medium | High | Pass budget, reduced resolution at deeper levels, fixed light rig, merged geometry, automatic quality steps. Measured from Phase 1. |
| Shader recompiles when a new room appears (hitch) | Medium | Medium | Identical light layout in every room; `renderer.compile()` during background build. |
| Generated houses feel either trivial or hopeless | Medium | Medium | Difficulty table is data; Gate G2 tunes it from real play; metrics in the CI sweep show the effect of every change. |
| Twin rooms feel unfair | Low | Medium | Unique signature landmark in every room; twins only from Medium upward. |
| Generator output drifts between versions, breaking shared seeds | Medium | Medium | Golden seeds, version digit in the seed code, stored `level_hash` checked on regeneration. |
| Network delay shows empty doorways | Low | High | Radius-4 streaming, safety-net fetch, 300 ms latency test. |
| Safari Pointer Lock and Web Audio quirks | Medium | Low | Cross-browser checklist; audio resumed on the start click; Pointer Lock retried on click. |
| Asymmetric back view changes while straddling a door | Certain | Low | This is the intended effect. 0.3 m door jambs hide most of it from the side view. |
| Motion sickness from fast turns and head bob | Low | Medium | Field-of-view and head-bob settings; moderate walking speed. |
| AI agents drift from the plan across sessions | Medium | Medium | `AGENTS.md`, task IDs, acceptance criteria in every pull request, ADRs for any deviation, human review of every PR. |

## 24. Open items for the product owner

None of these block Phase 0; each has a default in this plan that stands unless changed before the listed date.

- [ ] Confirm the timer never pauses, including during the debug view (A6, A8). Needed by 2 Nov (T5.4).
- [ ] Confirm walking into the diploma collects it, with no interaction key (A7). Needed by 9 Nov (T6.1).
- [ ] Confirm Hungarian as the default UI language with English available (A3). Needed by 2 Nov (T5.3).
- [ ] Choose the hosting provider and create the production database. Needed by 29 Oct (T4.7).
- [ ] Name the reference laptop for performance measurement. Needed by 14 Oct (T1.1).
- [ ] Decide whether the debug view stays enabled in production (default: yes, as the spec makes it part of the game). Needed by 16 Nov.
- [ ] Approve the product name shown on the title screen and the in-game Hungarian strings. Needed by 13 Nov (G3).
