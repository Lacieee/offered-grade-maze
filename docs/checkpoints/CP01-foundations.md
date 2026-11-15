# Checkpoint 01 — Foundations

**Product:** Offered Grade Maze (Hungarian name of the goal object: *Megajánlott jegy*) — Release 1.0
**Track:** Both (A = engine, B = platform) · **Planned dates:** Mon 12 Oct – Tue 13 Oct 2026
**Depends on:** nothing · **Unlocks:** every other checkpoint (CP02 and CP04 start right after this one)

---

## 1. Goal

Create the monorepo, tooling, CI and the shared contracts that every later checkpoint builds on. At the end, both tracks can start in parallel. The client and server teams share one definition of seeds, door geometry and wire DTOs, and the generator has a deterministic random number generator.

## 2. Standing rules (apply to every checkpoint)

- Read `AGENTS.md`, `docs/architecture.md` and `docs/decisions.md` before starting. Where this checkpoint file and `docs/architecture.md` differ, **this file wins**; mention the difference in the PR.
- TypeScript strict, ESM only, Node.js 22 LTS, pnpm. No `any`, no unexplained non-null assertions.
- `packages/client` must never import `packages/generator`.
- Generator code must be deterministic: no `Math.random`, no `Date`, no `performance`, no floating-point maths in generation logic, no iteration over unordered collections without sorting.
- One task ID per branch and pull request (for example `feat/CP01-T3-seed-codec`). The PR description lists this checkpoint's acceptance criteria as checkboxes with evidence.
- Every bug fix starts with a failing test.

## 3. Product decisions (final, from the product owner)

Record these verbatim in `docs/decisions.md`:

| ID | Decision |
| --- | --- |
| PD1 | The timer never pauses: not on Esc, not on tab switch, not while the debug view is open. |
| PD2 | The goal (the Offered Grade diploma) is collected by walking into it. There is no interaction key. |
| PD3 | UI language: **English is the default**, Hungarian is available as a second language. |
| PD4 | The game runs **locally** via Docker Compose (app + PostgreSQL). There is no cloud deployment, no staging environment. |
| PD5 | Reference machine for performance: **MacBook Pro with Apple M1 Max**, macOS, latest Chrome and Safari. |
| PD6 | The admin/debug view stays enabled in release builds. |
| PD7 | Product name shown in the UI: **Offered Grade Maze**. The goal object is called "Offered Grade" in English and "Megajánlott jegy" in Hungarian. |
| PD8 | The result is flagged `debug_used = true` if the debug view was opened during the game; the result is still valid. |

## 4. Scope

**In scope:** repository scaffold, tooling, CI, local PostgreSQL via Docker Compose, `AGENTS.md`, docs folder, `shared` seed codec, `shared` geometry, `shared` DTO schemas, `generator` PRNG.

**Out of scope:** any rendering, any generation logic, any HTTP server code.

## 5. Requirements

### T1 — Monorepo scaffold

1. Repository root name: `offered-grade-maze`. Layout:

```
offered-grade-maze/
  AGENTS.md
  README.md
  docs/
    architecture.md      # provided by the product owner (export of the architecture doc)
    decisions.md         # section 3 of this file
    adr/0000-template.md
    adr/0001-stack.md
    checkpoints/         # these checkpoint files
  packages/
    shared/              # @ogm/shared   — pure TS, no DOM, no Node APIs
    generator/           # @ogm/generator — server-only, deterministic
    server/              # @ogm/server   — Fastify (filled in CP07)
    client/              # @ogm/client   — Vite + React + Three.js (filled in CP02)
  e2e/                   # Playwright (filled in CP03/CP10)
  docker/
  .github/workflows/
```

2. pnpm workspaces + Turborepo. Root scripts: `build`, `dev`, `lint`, `typecheck`, `test`, `test:prop`, `format`, `format:check`.
3. `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `module`/`moduleResolution` `NodeNext` (bundler resolution in `client`), `target` ES2022. Every package extends it.
4. Each package has `src/index.ts`, its own `package.json` (`"type": "module"`), `tsconfig.json` and a `vitest.config.ts`.
5. ESLint (flat config, `typescript-eslint` strict-type-checked) + Prettier (single quotes, trailing commas, 100 columns).
6. **Determinism lint rule** for `packages/generator/**`: `no-restricted-globals` and `no-restricted-properties` ban `Math.random`, `Date`, `performance`, `crypto.getRandomValues`, `Math.sin`, `Math.cos`, `Math.tan`, `Math.sqrt`, `Math.pow`, `Math.exp`, `Math.log`, and the `**` operator is flagged by a custom `no-restricted-syntax` selector. A file that needs an exception must justify it in a comment and an ADR.
7. Pin exact dependency versions (no `^`). Record the main versions in `docs/adr/0001-stack.md`.

### T2 — CI and local database

1. `.github/workflows/ci.yml` on pull requests and `main`: checkout, pnpm install (cached), `lint`, `typecheck`, `test`, `format:check`.
2. `docker/docker-compose.dev.yml`: service `db` with `postgres:16`, port 5432, user/password/db `ogm`/`ogm`/`ogm`, named volume. Root script `db:up` / `db:down`.
3. `README.md`: prerequisites (Node 22, pnpm 9, Docker Desktop), install, `pnpm db:up`, `pnpm test`.

### T3 — `shared/seed`: seed codec

Seed code format: `<D><V>-<XXXX>-<XXXX>`, for example `M1-7K2Q-X9MP`.

- `D` difficulty letter: `E` (easy), `M` (medium), `H` (hard).
- `V` generator major version, one digit 1–9. Release 1.0 supports only `1`.
- `XXXX-XXXX`: 8 Crockford base32 characters = 40 bits. Alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ`.

API (export from `@ogm/shared`):

```ts
export type Difficulty = 'easy' | 'medium' | 'hard';
export const SUPPORTED_GENERATOR_VERSIONS = [1] as const;

export interface ParsedSeed {
  difficulty: Difficulty;
  version: number;
  payload: string;     // 8 canonical base32 chars, no dashes
  canonical: string;   // 'M1-7K2Q-X9MP'
}

export type SeedParseError = 'empty' | 'length' | 'difficulty' | 'version' | 'unsupported_version' | 'character';

export function parseSeed(input: string): { ok: true; seed: ParsedSeed } | { ok: false; error: SeedParseError };
export function formatSeed(difficulty: Difficulty, version: number, payload40: Uint8Array /* length 5 */): string;
export function difficultyLetter(d: Difficulty): 'E' | 'M' | 'H';
```

Parsing rules: trim; uppercase; remove spaces, `-` and `_`; then the string must be exactly 10 characters. Normalise `O`→`0`, `I`→`1`, `L`→`1` in the payload part only. `U` and any other character outside the alphabet → `character`. An unknown version digit → `unsupported_version`.

### T4 — `shared/geometry`: constants and door frames

Units are metres; generator grid unit is 0.25 m. Export these constants:

| Constant | Value | Meaning |
| --- | --- | --- |
| `GRID` | 0.25 | grid cell size (m) |
| `ROOM_HEIGHT` | 2.8 | floor to ceiling |
| `DOOR_WIDTH` | 1.0 | every doorway |
| `DOOR_HEIGHT` | 2.1 | every doorway |
| `WALL_HALF` | 0.15 | wall thickness owned by each room, outside its footprint |
| `DOOR_CORNER_MARGIN` | 0.5 | min distance door edge → room corner |
| `DOOR_SPACING` | 0.6 | min distance between two doors on one wall |
| `DOOR_CLEARANCE_W` | 1.4 | clearance zone width in front of a door |
| `DOOR_CLEARANCE_D` | 1.2 | clearance zone depth in front of a door |
| `PORTAL_BOX_DEPTH` | 0.25 | portal mesh depth behind the portal plane |
| `EYE_HEIGHT` | 1.65 | camera height |
| `PLAYER_RADIUS` | 0.3 | collision circle |
| `WALK_SPEED` | 3.0 | m/s |

Room coordinates: right-handed, +Y up, origin at the floor centre. Interior footprint x ∈ [−w/2, +w/2], z ∈ [−d/2, +d/2]. Walls: `N` at z = −d/2, `S` at z = +d/2, `W` at x = −w/2, `E` at x = +w/2.

```ts
export type Wall = 'N' | 'E' | 'S' | 'W';
export interface DoorFrame {
  origin: { x: number; y: number; z: number }; // bottom centre of opening, on the portal plane
  yaw: number;                                  // rotation about +Y, radians
  inward: { x: number; z: number };             // local +Z in room coordinates
  right: { x: number; z: number };              // local +X in room coordinates
}
export function doorFrame(room: { width: number; depth: number }, door: { wall: Wall; offset: number }): DoorFrame;
export function wallLength(room: { width: number; depth: number }, wall: Wall): number;
export function maxDoorOffset(room: { width: number; depth: number }, wall: Wall): number; // = wallLength/2 − DOOR_WIDTH/2 − DOOR_CORNER_MARGIN
```

Rotation convention: a rotation by θ about +Y maps local +X to (cos θ, 0, −sin θ) and local +Z to (sin θ, 0, cos θ). Exact per-wall values (these are the contract, test all four):

| Wall | yaw | inward (local +Z) | right (local +X) | origin |
| --- | --- | --- | --- | --- |
| N | 0 | (0, +1) | (+1, 0) | (offset, 0, −d/2 − WALL_HALF) |
| S | π | (0, −1) | (−1, 0) | (−offset, 0, +d/2 + WALL_HALF) |
| E | −π/2 | (−1, 0) | (0, +1) | (+w/2 + WALL_HALF, 0, offset) |
| W | +π/2 | (+1, 0) | (0, −1) | (−w/2 − WALL_HALF, 0, −offset) |

`offset` is the signed distance from the wall centre to the door centre along the door's local +X. The portal plane is the wall line pushed outward by `WALL_HALF`.

### T5 — `shared/dto`: wire schemas (Zod)

Define Zod schemas and export inferred types. These are the contracts between client and server; later checkpoints may extend but not break them.

```ts
RoomId    = /^r\d{2}$/              DoorId = /^d\d$/
Color     = /^#[0-9a-f]{6}$/i       Num = finite number
RoomType  = 'living' | 'kitchen' | 'bedroom' | 'bathroom' | 'hallway' | 'study'
FloorKind = 'wood' | 'tile' | 'carpet'

DoorDTO      { id: DoorId; wall: Wall; offset: Num; link: { room: RoomId; door: DoorId } | null }
FurnitureDTO { id: /^f\d{2}$/; prefab: /^[a-z][a-z0-9_]*$/; x: Num; z: Num; rot: 0|1|2|3;
               variant: int ≥ 0; colors: Color[]; signature?: true;
               params?: Record<string, number | string> }
LightDTO     { kind: 'ceiling' | 'lamp' | 'goal'; x: Num; y: Num; z: Num; color: Color; intensity: Num ≥ 0 }
RoomDTO      { id; type; label: string /* i18n key, e.g. 'room.living' */;
               width; depth; height; floor: FloorKind;
               palette: { wall; floor; trim; ceiling: Color };
               doors: DoorDTO[1..4]; furniture: FurnitureDTO[]; lights: LightDTO[0..4];
               goal?: { x; y; z } }
Spawn        { x: Num; z: Num; yaw: Num }

CreateGameRequest  = { mode: 'random'; difficulty: Difficulty } | { mode: 'seed'; seed: string }
CreateGameResponse = { gameId: uuid; seed: string; difficulty; generatorVersion: int;
                       startRoom: RoomId; spawn: Spawn; rooms: RoomDTO[] }
StartResponse      = { startedAt: ISO datetime string }
TransitionRequest  = { seq: int ≥ 1; from: RoomId; door: DoorId; clientElapsedMs: int ≥ 0 }
TransitionResponse = { seq; current: RoomId; rooms: RoomDTO[] }
CompleteRequest    = { lastSeq: int ≥ 0; clientElapsedMs: int ≥ 0; debugUsed: boolean }
ResultDTO          = { seed; difficulty; completionMs: int; timeSource: 'client' | 'server';
                       completedAt: ISO; debugUsed: boolean }
CompleteResponse   = { result: ResultDTO }
PathStep           = { room: RoomId; arriveDoor: DoorId | null; exitDoor: DoorId | null }
DebugRoomDTO       = { id; type; label; depth: int; onSpine: boolean; twinOf: RoomId | null;
                       doors: { id; wall; link: {room; door} | null }[] }
DebugResponse      = { seed; difficulty; generatorVersion; levelHash: string; start: RoomId; goal: RoomId;
                       current: RoomId; rooms: DebugRoomDTO[]; metrics: Record<string, number>;
                       pathFromStart: PathStep[]; pathFromCurrent: PathStep[] }
ApiError           = { error: { code: string; message: string } }
```

`PathStep` convention: the first step has `arriveDoor = null`, the last step (the goal) has `exitDoor = null`.

### T6 — `generator/prng`

```ts
export function cyrb128(str: string): [number, number, number, number]; // four uint32
export class Sfc32 {
  constructor(seed: [number, number, number, number]);
  nextU32(): number;                         // uint32
  int(min: number, max: number): number;     // inclusive, rejection sampling, no modulo bias
  chance(perMille: number): boolean;         // integer probability 0..1000
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];      // Fisher–Yates on a copy
  weighted(weights: readonly number[]): number; // index; integer weights
}
export function rngFor(canonicalSeed: string, label: string): Sfc32; // seeds with cyrb128(`${canonicalSeed}|${label}`)
```

Use only 32-bit integer operations (`>>> 0`, `| 0`, `Math.imul`). Warm up each new generator by discarding 15 outputs.

## 6. Deliverables

- Root config files, `AGENTS.md`, `README.md`, `docs/decisions.md`, `docs/adr/0000-template.md`, `docs/adr/0001-stack.md`.
- `packages/shared/src/{seed,geometry,dto}/…` with tests.
- `packages/generator/src/prng/…` with tests.
- `.github/workflows/ci.yml`, `docker/docker-compose.dev.yml`.

`AGENTS.md` must contain: the standing rules of section 2, the product decisions table of section 3, the package dependency rule, the definition of done (section 8), and the glossary: House/`Level`, Room, Door, Link, Sealed door, Reciprocal pair, Asymmetric link, Self-link, Portal, Depth, Spine, Decoy, Twin, Signature, Goal, Game, Result, Seed code.

## 7. Acceptance criteria

- [ ] `pnpm install && pnpm build && pnpm lint && pnpm typecheck && pnpm test` succeed on a clean clone.
- [ ] CI runs on a pull request and is green.
- [ ] `pnpm db:up` starts PostgreSQL; `psql postgres://ogm:ogm@localhost:5432/ogm -c 'select 1'` works.
- [ ] Seed codec: 10 000 random payloads round-trip `formatSeed → parseSeed`; `m1 7k2q x9mp`, `M17K2QX9MP` and `M1-7K2Q-X9MP` parse to the same canonical seed; `O/I/L` normalise; `U`, wrong length, unknown difficulty letter and version `2` return the documented errors.
- [ ] `doorFrame` tests cover all four walls with non-zero offsets and assert the exact table values of T4 (tolerance 1e-12).
- [ ] Every DTO schema has one valid and at least two invalid fixtures in tests.
- [ ] PRNG: a committed snapshot of the first 100 outputs of `rngFor('M1-7K2Q-X9MP', 'test')` stays stable; `int(0, 2)` over 300 000 draws is within ±1 % per bucket; `shuffle` returns a permutation.
- [ ] Adding `Math.random()` to any file in `packages/generator/src` makes `pnpm lint` fail.

## 8. Definition of done (every checkpoint)

- Lint, typecheck, all tests green in CI.
- Acceptance criteria demonstrated in the PR with evidence.
- Public functions have TSDoc; `shared` and `generator` keep ≥ 90 % line coverage.
- No console errors or warnings in the client (from CP02 on).
