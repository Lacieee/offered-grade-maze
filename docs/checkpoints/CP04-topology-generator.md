# Checkpoint 04 — Topology generator, validator and CLI

**Product:** Offered Grade Maze — Release 1.0
**Track:** B (platform) · **Planned dates:** Wed 14 Oct – Wed 21 Oct 2026
**Depends on:** CP01 · **Unlocks:** CP05, CP07

---

## 1. Goal

Implement `generateLevel(seedCode)` in `@ogm/generator`: a deterministic, seed-reproducible, non-Euclidean house topology that is **solvable from every reachable room by construction**. Add an independent validator that re-proves solvability, plus a CLI for sweeps and inspection. Furniture comes in CP05; this checkpoint produces rooms with doors, links, start, goal, spawn, metrics and a stable `levelHash`.

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). This package is **deterministic**: integer maths only, all randomness from `rngFor(canonicalSeed, label)`, sort before iterating any `Map`/`Set`/object keys. The determinism lint rule from CP01 must stay green.

## 3. Scope

**In scope:** difficulty table, room/type/depth/footprint/door generation, link generation, twins selection, ID shuffling, canonical JSON and hash, validator checks V1–V6, V9, V10, metrics, `shortestPath` in `@ogm/shared`, retry loop, golden seeds, CLI.

**Out of scope:** furniture, palettes, signatures, lights beyond one ceiling light, walkability (CP05); HTTP (CP07).

## 4. Data model (`packages/generator/src/types.ts`)

Internally the generator works in **grid units** (1 unit = 0.25 m, integers). It outputs metres via `@ogm/shared` DTOs.

```ts
export interface Level {
  seed: string;                 // canonical seed code
  difficulty: Difficulty;
  generatorVersion: 1;
  startRoom: RoomId;
  goalRoom: RoomId;
  spawn: Spawn;                 // CP04: start-room centre, yaw facing the start room's lowest door id
  rooms: RoomDTO[];             // sorted by id; doors sorted by id; furniture [] in CP04
  meta: {
    depth: Record<RoomId, number>;
    spine: RoomId[];            // start … goal, length L + 1
    twinOf: Record<RoomId, RoomId | null>;
    attempts: number;
    metrics: LevelMetrics;
    levelHash: string;          // SHA-256 hex of canonical JSON (see T6)
  };
}
export const GENERATOR_VERSION = 1;
```

The goal object position in CP04 is `{ x: 0, y: 1.2, z: 0 }` of the goal room (CP05 reserves a zone for it).

## 5. Requirements

### T1 — Difficulty table (`src/difficulty/table.ts`, data only)

Probabilities are integers in per-mille.

| Parameter | easy | medium | hard |
| --- | --- | --- | --- |
| `rooms` (N) | 8–10 | 12–16 | 18–24 |
| `solutionLength` (L, doors) | 4–5 | 6–7 | 8–10 |
| `doorsPerRoom` | 2–3 | 2–4 | 3–4 |
| `reciprocalPerMille` | 850 | 500 | 200 |
| `asymmetricShare` (validated, per-mille) | 0–250 | 300–600 | 600–1000 |
| `selfLinks` | 0–0 | 1–2 | 2–4 |
| `sealedDoors` | 0–1 | 1–3 | 3–6 |
| `longBackLinks` (target depth ≤ source depth − 3) | 0–1 | 2–3 | 4–99 |
| `twins` | 0–0 | 1–2 | 3–5 |
| `misleadingDoorsMin` | 1 | 3 | 6 |
| remaining-slot weights back / lateral / forward | 30 / 20 / 50 | 40 / 25 / 35 | 50 / 25 / 25 |

Room type sizes (metres, snap to 0.5 m; convert to units ×4) and floor kinds:

| Type | width | depth | floor |
| --- | --- | --- | --- |
| living | 6.0–8.0 | 6.0–9.0 | wood |
| kitchen | 4.0–6.0 | 4.0–6.0 | tile |
| bedroom | 4.0–6.0 | 4.5–6.0 | carpet |
| bathroom | 3.0–4.0 | 3.0–4.0 | tile |
| hallway | 2.0–2.5 | 5.0–9.0 | wood |
| study | 3.5–5.0 | 3.5–5.0 | carpet |

Room labels: `room.living`, `room.kitchen`, `room.bedroom`, `room.bathroom`, `room.hallway`, `room.study`.

### T2 — Construction invariants (the core of solvability)

Let `d(r)` be a room's assigned depth; `d(start) = 0`, `d(goal) = L`, and the goal is the **only** room at depth L.

1. **No skipping ahead:** every link u → v satisfies `d(v) ≤ d(u) + 1`.
2. **Progress:** every room u with `d(u) < L` has at least one link to a room at depth `d(u) + 1`.
3. **Coverage:** every room v with `d(v) ≥ 1` receives at least one link from a room at depth `d(v) − 1`.

Consequences (re-proved by the validator on the real graph): every start→goal route has ≥ L doors and the spine has exactly L; from every room the goal is reachable in `L − d(u)` forward steps (no trap regions); every room is reachable from the start.

### T3 — Algorithm (`src/topology/`)

Each step uses its own PRNG label, `topology#<attempt>/<step>`.

1. **Parameters:** parse the seed, load the table row, draw N and L.
2. **Rooms and types:** create N rooms with temporary ids `t00…`. Assign types so each of the 6 types appears at least once; fill the rest with weights living 1, kitchen 1, bedroom 2, bathroom 1, hallway 2, study 1. The start room is `living` or `hallway`. Choose the spine (start, L − 1 middle rooms, goal). The goal room is never a twin.
3. **Twins (medium/hard):** draw the twin count. Each twin is a non-spine room that copies a spine room's (the *original's*) type, footprint and door count and positions. Record `twinOf`.
4. **Depths:** spine rooms get 0…L. Decoys get depths in 1…L−1 with triangular weights favouring the middle. Rebalance until **layer capacity** holds: for every k < L, the sum of door slots of layer-k rooms ≥ number of rooms in layer k+1 + number of layer-k rooms (each needs one forward door).
5. **Footprints and doors:** draw width/depth from the type's range (not for twins; they copy). Draw door count from `doorsPerRoom` (start ≥ 2, hallway +1 up to 4, goal ≥ 1). Place doors: choose a wall (weighted by wall length), then an integer offset in units satisfying corner margin 0.5 m and spacing 0.6 m from other doors on the same wall. Door ids `d0…` in placement order.
6. **Mandatory links**, in this order:
   a. spine: r(k) → r(k+1) for k = 0…L−1;
   b. coverage: each decoy at depth k+1 picks a parent at depth k with a free slot (most free slots first, ties by temporary id) and links parent → decoy;
   c. progress: any room with d < L still lacking a forward link takes a free slot and links to a random room at depth d+1.

   The **arrival door** in the target is random, preferring doors not yet used as an arrival and (on easy) doors whose own slot is still free.
7. **Fixed-count specials**, using free slots: draw the target counts of self-links, sealed doors and long back links from their ranges, then allocate them. A self-link goes to another door of the same room (never the same door; the room needs ≥ 2 doors). A long back link targets a room with depth ≤ d − 3. A sealed door is preferably a door that is already the arrival point of a non-reciprocated link (this makes a true one-way passage).
8. **Reciprocation:** for each existing link u.s → v.t where slot v.t is still free and `d(u) ≤ d(v) + 1`, set v.t → u.s with probability `reciprocalPerMille`.
9. **Pairing pass:** each remaining free slot u.s, with probability `reciprocalPerMille`, pairs with another free slot v.t (|d(u) − d(v)| ≤ 1) and links both directions.
10. **Remaining free slots:** draw back / lateral / forward from the weights; a forward target must be at depth d+1; the target door is random.
11. **Validate and measure** (T4, T5). Metrics outside the table's ranges, or any validator error, fail the attempt.
12. **Finalise:** shuffle room ids with a seeded permutation into `r00…r(N−1)` (ids reveal nothing about depth or spine); convert to metres and build `RoomDTO`s (palette: neutral greys; furniture `[]`; one ceiling light at (0, 2.6, 0), colour `#fff2dd`, intensity 1.0; goal field on the goal room); compute spawn and `levelHash`.

**Retry:** on failure, retry with `attempt + 1` up to 64 attempts. After 64 failures, throw `GenerationError` (CP07 handles it).

### T4 — Validator (`src/validate/`, independent)

`validateLevel(level: Level): ValidationIssue[]` takes only the finished `Level` and must not import anything from `src/topology/`. Sealed doors add no graph edge. R = rooms reachable from start (BFS); C = rooms that can reach the goal (BFS on reversed edges).

| ID | Check |
| --- | --- |
| V1 | goal ∈ R |
| V2 | R ⊆ C — every reachable room can still reach the goal (no trap regions or exit-less cycles) |
| V3 | shortest distance start → goal within the difficulty's L range |
| V4 | every room ∈ R |
| V5 | structural integrity: targets exist; ≤ 1 link per door; no door links to itself; door ids unique; 1–4 doors per room; start ≠ goal; goal field only on the goal room |
| V6 | door placement: corner margin, spacing, no overlaps, all doors 1.0 × 2.1 m |
| V9 | metrics within table ranges |
| V10 | determinism: generating the same seed twice yields the same `levelHash` (test/CI only) |

V7 and V8 (furniture, walkability) are added in CP05. Cycles are allowed and never rejected.

### T5 — Metrics (`LevelMetrics`)

- `rooms`, `doors`, `links`, `shortest` = BFS distance start → goal.
- `asymmetricShare` (per-mille) = links whose target door does not link back to the source door ÷ all links. A sealed target counts as asymmetric.
- `selfLinks`, `sealedDoors`, `longBackLinks` (target depth ≤ source depth − 3, using assigned depths), `twins`.
- `misleadingDoors` = number of (spine room except goal, linked door) pairs where the BFS distance from the target to the goal is ≥ the distance from the spine room to the goal.

### T6 — Canonical JSON and hash

Canonical JSON: keys sorted alphabetically at every level, no whitespace, rooms sorted by id, doors by id, furniture by id, numbers as produced (they are exact multiples of 0.25). `levelHash` = SHA-256 hex (Node `crypto`, allowed here because the hash is not a generation input) of the canonical JSON of `{ seed, difficulty, generatorVersion, startRoom, goalRoom, spawn, rooms }`.

### T7 — `shortestPath` in `@ogm/shared` (`src/graph/`)

```ts
export interface GraphRoom { id: RoomId; doors: { id: DoorId; link: { room: RoomId; door: DoorId } | null }[] }
export function shortestPath(rooms: GraphRoom[], from: RoomId, to: RoomId): PathStep[] | null;
```

BFS with stable tie-breaking: expand rooms in BFS order, doors in id order, first discovery wins. Returns steps per the `PathStep` convention (first `arriveDoor = null`, last `exitDoor = null`). Shared with the server (CP07) and the debug view (CP10).

### T8 — Golden seeds

`test/golden.json`: 30 seed codes (10 per difficulty) with their `levelHash`. A test regenerates all 30 and compares. **Until v1.0.0 is tagged**, golden hashes may be regenerated in a PR that explains the reason (CP05 will do this when adding furniture). After v1.0.0, any change to output requires bumping `GENERATOR_VERSION`.

### T9 — CLI (`packages/generator/cli`, root script `pnpm gen`)

| Command | Behaviour |
| --- | --- |
| `pnpm gen random --difficulty hard` | prints a fresh seed code (uses Node `crypto.randomBytes(5)`, CLI only) and its summary |
| `pnpm gen show <seed>` | summary: rooms, types, depths, links, metrics, attempts, ms |
| `pnpm gen validate <seed>` | validator issues or "valid" |
| `pnpm gen dump <seed> --json out.json --svg out.svg` | full level JSON; SVG graph laid out left→right by depth, spine highlighted |
| `pnpm gen sweep --difficulty <d> --count 10000` | generates seeds `<D>1-…` from a counter, reports validity, retry rate, metric distributions and p50/p95 ms |

## 6. Acceptance criteria

- [ ] Property tests (fast-check, 1 000 seeds per difficulty per CI run): invariants 1–3 hold on the assigned depths, and validator V1–V6, V9 pass.
- [ ] Negative validator tests, each a hand-built level that must be rejected: goal unreachable (V1); reachable sink cycle without exit (V2); one-way door into a dead end (V2); path too short (V3); orphan room (V4); door linked to itself (V5); overlapping doors (V6).
- [ ] `pnpm gen sweep --count 10000` passes for every difficulty: 0 invalid levels, retry rate < 2 %, p95 generation time < 50 ms per attempt and < 200 ms per level on the M1 Max.
- [ ] Golden test green; generating any golden seed twice in the same process and in separate processes gives the same hash.
- [ ] Room ids are a permutation: in a 1 000-seed sweep, the start room is `r00` in roughly 1/N of cases, not always.
- [ ] `shortestPath` unit tests include self-links, multi-edges between the same rooms and unreachable targets.
- [ ] Lint shows no determinism-rule violations in `packages/generator/src`.
