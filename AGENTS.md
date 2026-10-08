# AGENTS.md — rules for every contributor (human or AI agent)

**Offered Grade Maze** is a first-person browser game set in an impossible, non-Euclidean house.
The player hunts for the _Offered Grade_ diploma (Hungarian: _Megajánlott jegy_). This file is
the short version of how we work. Read it before every task.

## Read first

1. This file.
2. `docs/decisions.md`: final product decisions (PD1–PD10).
3. `docs/architecture.md`: the architecture and implementation plan.
4. The checkpoint file you are working on, in `docs/checkpoints/`.

Where a checkpoint file and `docs/architecture.md` differ, **the checkpoint file wins**. Mention
the difference in the PR. If a task conflicts with both, stop and raise it in the PR instead of
improvising. Architecture changes get an ADR in `docs/adr/` (copy `0000-template.md`).

## Standing rules (every checkpoint)

- TypeScript strict, ESM only, Node.js 22 LTS (24 LTS also supported and tested in CI), pnpm 9. No `any`. No non-null assertions (`!`)
  without a comment that says why the value cannot be missing.
- `packages/client` must never import `packages/generator` (ESLint enforces it).
- Generator code must be deterministic: no `Math.random`, no `Date`, no `performance`, no
  floating-point maths in generation logic (no `Math.sin/cos/tan/sqrt/pow/exp/log`, no `**`),
  and no iteration over unordered collections (`Map`, `Set`, object keys) without sorting.
  All randomness comes from `rngFor(canonicalSeed, label)`. ESLint enforces the API bans in
  `packages/generator/**`, and `pnpm lint` fails if they stop working. A file that needs an
  exception must justify it in a comment and an ADR.
- Any change that alters generator output for an existing seed must bump `GENERATOR_VERSION`
  and update the golden-seed hashes in the same PR.
- One task ID per branch and pull request, for example `feat/CP01-T3-seed-codec`. The PR
  description lists the checkpoint's acceptance criteria as checkboxes with evidence (test
  names, screenshots, numbers).
- Every bug fix starts with a failing test.
- Never change a `@ogm/shared` DTO without updating both client and server in the same PR.
  DTOs may be extended but must not be broken.
- Pin exact dependency versions (no `^` or `~`; `.npmrc` sets `save-exact`).

## Product decisions (final, from the product owner)

| ID   | Decision                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PD1  | The timer never pauses: not on Esc, not on tab switch, not while the debug view is open.                                                        |
| PD2  | The goal (the Offered Grade diploma) is collected by walking into it. There is no interaction key.                                              |
| PD3  | UI language: **English is the default**, Hungarian is available as a second language.                                                           |
| PD4  | The game runs **locally** via Docker Compose (app + PostgreSQL). There is no cloud deployment, no staging environment.                          |
| PD5  | Reference machine for performance: **MacBook Pro with Apple M1 Max**, macOS, latest Chrome and Safari.                                          |
| PD6  | The admin/debug view stays enabled in release builds.                                                                                           |
| PD7  | Product name shown in the UI: **Offered Grade Maze**. The goal object is called "Offered Grade" in English and "Megajánlott jegy" in Hungarian. |
| PD8  | The result is flagged `debug_used = true` if the debug view was opened during the game; the result is still valid.                              |
| PD9  | Sealed (closed) doors are decorative: no link may arrive at a sealed door. One-way passages come only from asymmetric links.                    |
| PD10 | Every doorway looks identical in every room (frame, jambs, doorstep; unlit), so crossing a door is not noticeable.                              |

## Packages and the dependency rule

| Package          | Path                 | Role                                                           |
| ---------------- | -------------------- | -------------------------------------------------------------- |
| `@ogm/shared`    | `packages/shared`    | Pure TS contracts: seed codec, door geometry, Zod DTOs, graph. |
| `@ogm/generator` | `packages/generator` | Deterministic, server-only level generation and validation.    |
| `@ogm/server`    | `packages/server`    | Fastify API, sessions, timing, PostgreSQL persistence.         |
| `@ogm/client`    | `packages/client`    | Vite + React + Three.js browser client (portals, audio, UI).   |

Dependencies flow one way:

```
client ──► shared ◄── generator ◄── server
                 ▲                    │
                 └────────────────────┘
```

- `client` and `server` depend on `shared`; `server` depends on `generator`.
- `client` **never** depends on `generator` (or `server`).
- `shared` depends on no workspace package and uses no DOM and no Node APIs.
- `generator` never depends on `client` or `server`.

## Commands

```sh
pnpm install          # once
pnpm dev              # client dev server: http://localhost:5173/?dev=fixtures&room=r00
pnpm build            # build every package (turbo, cached)
pnpm lint             # ESLint (type-aware) + determinism guard
pnpm typecheck        # tsc --noEmit everywhere
pnpm test             # Vitest; shared and generator with coverage (≥ 90 % lines)
pnpm test:prop        # property tests with 10 000 runs
pnpm format           # Prettier write; format:check in CI
pnpm db:up / db:down  # local PostgreSQL 16 (Docker)
```

## Definition of done (every checkpoint)

- Lint, typecheck and all tests green in CI.
- Acceptance criteria demonstrated in the PR with evidence.
- Public functions have TSDoc; `shared` and `generator` keep ≥ 90 % line coverage.
- No console errors or warnings in the client (from CP02 on).

## Glossary

Every contributor and every code identifier uses these terms exactly. Hungarian spec terms are
given where they differ.

| Term            | Code name         | Meaning                                                                                                                                       |
| --------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| House           | `Level`           | The full generated structure for one seed: rooms, doors, links, start, goal. Immutable once generated.                                        |
| Room (helyiség) | `Room`            | A concrete room with a stable ID (`r00`…`r23`), type, footprint, palette, furniture and doors. One identity no matter how it is reached.      |
| Door            | `Door`            | A physical doorway in a wall of one room. ID unique within the room (`d0`…`d3`).                                                              |
| Link            | `Link`            | Directed connection `(room, door) → (targetRoom, targetDoor)`. Each door has at most one outgoing link; the reverse direction is independent. |
| Sealed door     | `link = null`     | A door with no outgoing link. Rendered as a closed panel. Decorative: no link ever arrives at it (PD9).                                       |
| Reciprocal pair | derived           | Two links that point at each other's doors. Feels like a normal door.                                                                         |
| Asymmetric link | derived           | A link whose target door leads somewhere other than back.                                                                                     |
| Self-link       | derived           | A link whose target room is the same room (via a different door). A door never links to itself.                                               |
| Portal          | `Portal` (client) | The rendered, live view through a door with a link.                                                                                           |
| Depth           | `depth`           | A room's intended shortest door-distance from the start. Start = 0, goal = L.                                                                 |
| Spine           | `spine`           | The rooms r0 (start) … rL (goal) that form one guaranteed shortest solution.                                                                  |
| Decoy           | derived           | Any room not on the spine. Feeds misleading routes (félrevezető útvonalak).                                                                   |
| Twin            | `twinOf`          | A decoy that copies the type, palette and main furniture of another room, but keeps its own signature landmark.                               |
| Signature       | `signature`       | A furniture item unique to one room in the house (for example a painting with a unique pattern). Makes every room distinguishable.            |
| Goal            | `goal`            | The Offered Grade (Megajánlott jegy) diploma, placed in the goal room.                                                                        |
| Game            | `Game`            | One play session on the server: seed, current room, transitions, timing, status.                                                              |
| Result          | `Result`          | The stored record of a completed game.                                                                                                        |
| Seed code       | `SeedCode`        | The human-readable seed string, for example `M1-7K2Q-X9MP`: difficulty letter, generator version, 40 random bits in Crockford base32.         |
